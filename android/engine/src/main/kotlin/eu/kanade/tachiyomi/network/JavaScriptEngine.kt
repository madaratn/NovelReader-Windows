package eu.kanade.tachiyomi.network

import android.content.Context
import app.cash.quickjs.QuickJs
import tachiyomi.core.common.util.lang.withIOContext

/** Same as Aniyomi on Android: scripts run in QuickJS. */
class JavaScriptEngine(@Suppress("UNUSED_PARAMETER") context: Context) {
    suspend fun <T> evaluate(script: String): T = withIOContext {
        @Suppress("UNCHECKED_CAST")
        QuickJs.create().use { it.evaluate(script) as T }
    }
}
