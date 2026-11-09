package nr.engine

import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import java.io.File
import java.lang.reflect.InvocationHandler
import java.lang.reflect.Proxy
import java.sql.Connection
import java.sql.PreparedStatement
import java.sql.ResultSet
import java.sql.Statement

/**
 * The engine's SQLite store (eu.kanade.tachiyomi.network.SqliteStore) is written
 * for JDBC. Android has the java.sql interfaces but no SQLite driver: this maps
 * the few JDBC calls the store makes onto Android's own SQLite.
 * One database object per file (it is thread-safe); closing is a no-op.
 */
object AndroidJdbc {
    private val dbs = HashMap<String, SQLiteDatabase>()

    @Synchronized
    fun connect(file: File): Connection {
        file.parentFile?.mkdirs()
        val db = dbs.getOrPut(file.absolutePath) {
            SQLiteDatabase.openOrCreateDatabase(file, null).also { runCatching { it.enableWriteAheadLogging() } }
        }
        return proxy(Connection::class.java) { name, args ->
            when (name) {
                "createStatement" -> statement(db, null)
                "prepareStatement" -> statement(db, args!![0] as String)
                "close", "commit", "rollback", "setAutoCommit" -> null
                "isClosed" -> false
                "getAutoCommit" -> true
                else -> throw UnsupportedOperationException("Connection.$name")
            }
        }
    }

    private fun isQuery(sql: String): Boolean {
        val s = sql.trimStart().uppercase()
        return s.startsWith("SELECT") || s.startsWith("PRAGMA") || s.startsWith("WITH")
    }

    private fun statement(db: SQLiteDatabase, prepared: String?): Statement {
        val params = HashMap<Int, Any?>()
        fun args(): Array<Any?> = (1..(params.keys.maxOrNull() ?: 0)).map { params[it] }.toTypedArray()
        fun update(sql: String, a: Array<Any?>): Int {
            if (isQuery(sql)) {
                db.rawQuery(sql, a.map { it?.toString() }.toTypedArray()).use { it.moveToFirst() }
                return 0
            }
            db.compileStatement(sql).use { st ->
                a.forEachIndexed { i, v ->
                    when (v) {
                        null -> st.bindNull(i + 1)
                        is Long -> st.bindLong(i + 1, v)
                        is Int -> st.bindLong(i + 1, v.toLong())
                        is Boolean -> st.bindLong(i + 1, if (v) 1 else 0)
                        is Double -> st.bindDouble(i + 1, v)
                        is Float -> st.bindDouble(i + 1, v.toDouble())
                        else -> st.bindString(i + 1, v.toString())
                    }
                }
                return st.executeUpdateDelete()
            }
        }
        fun query(sql: String, a: Array<Any?>): ResultSet =
            resultSet(db.rawQuery(sql, a.map { it?.toString() }.toTypedArray()))
        @Suppress("UNCHECKED_CAST")
        val iface = (if (prepared != null) PreparedStatement::class.java else Statement::class.java) as Class<Statement>
        return proxy(iface) { name, a ->
            when (name) {
                "setString", "setLong", "setInt", "setDouble", "setBoolean", "setFloat", "setObject" -> { params[a!![0] as Int] = a[1]; null }
                "setNull" -> { params[a!![0] as Int] = null; null }
                "clearParameters" -> { params.clear(); null }
                "executeUpdate" -> if (a.isNullOrEmpty()) update(prepared!!, args()) else update(a[0] as String, emptyArray())
                "execute" -> { if (a.isNullOrEmpty()) update(prepared!!, args()) else update(a[0] as String, emptyArray()); false }
                "executeQuery" -> if (a.isNullOrEmpty()) query(prepared!!, args()) else query(a[0] as String, emptyArray())
                "close" -> null
                "isClosed" -> false
                else -> throw UnsupportedOperationException("Statement.$name")
            }
        }
    }

    private fun resultSet(c: Cursor): ResultSet {
        var lastNull = false
        fun col(a: Array<Any?>?): Int {
            val k = a!![0]
            return if (k is Int) k - 1 else c.getColumnIndexOrThrow(k as String)
        }
        return proxy(ResultSet::class.java) { name, a ->
            when (name) {
                "next" -> c.moveToNext()
                "getString" -> col(a).let { i -> lastNull = c.isNull(i); if (lastNull) null else c.getString(i) }
                "getLong" -> col(a).let { i -> lastNull = c.isNull(i); if (lastNull) 0L else c.getLong(i) }
                "getInt" -> col(a).let { i -> lastNull = c.isNull(i); if (lastNull) 0 else c.getInt(i) }
                "getDouble" -> col(a).let { i -> lastNull = c.isNull(i); if (lastNull) 0.0 else c.getDouble(i) }
                "getBoolean" -> col(a).let { i -> lastNull = c.isNull(i); !lastNull && c.getLong(i) != 0L }
                "wasNull" -> lastNull
                "close" -> { c.close(); null }
                "isClosed" -> c.isClosed
                else -> throw UnsupportedOperationException("ResultSet.$name")
            }
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun <T> proxy(iface: Class<T>, f: (String, Array<Any?>?) -> Any?): T {
        val h = InvocationHandler { self, m, a ->
            when (m.name) {
                "toString" -> "AndroidJdbc:${iface.simpleName}"
                "hashCode" -> System.identityHashCode(self)
                "equals" -> self === a?.get(0)
                "unwrap", "isWrapperFor" -> throw UnsupportedOperationException(m.name)
                else -> f(m.name, a)
            }
        }
        return Proxy.newProxyInstance(iface.classLoader, arrayOf(iface), h) as T
    }
}
