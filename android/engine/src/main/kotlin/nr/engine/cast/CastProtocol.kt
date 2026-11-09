package nr.engine.cast

import java.io.ByteArrayOutputStream

/**
 * Cast protocol framing (CASTV2): every message is a 4-byte big-endian length then a
 * protobuf "CastMessage". Only the fields NovelReader needs, written by hand (no
 * protobuf library): 1 protocol_version, 2 source_id, 3 destination_id, 4 namespace,
 * 5 payload_type (0 = text), 6 payload_utf8.
 */
data class CastMessage(val source: String, val destination: String, val namespace: String, val payload: String)

object CastProtocol {
    const val CONNECTION = "urn:x-cast:com.google.cast.tp.connection"
    const val HEARTBEAT = "urn:x-cast:com.google.cast.tp.heartbeat"
    const val RECEIVER = "urn:x-cast:com.google.cast.receiver"
    const val MEDIA = "urn:x-cast:com.google.cast.media"
    const val DEFAULT_MEDIA_RECEIVER = "CC1AD845"

    private fun varint(out: ByteArrayOutputStream, v0: Long) {
        var v = v0
        while (v and 0x7FL.inv() != 0L) { out.write(((v and 0x7F) or 0x80).toInt()); v = v ushr 7 }
        out.write(v.toInt())
    }

    private fun string(out: ByteArrayOutputStream, field: Int, s: String) {
        val b = s.toByteArray(Charsets.UTF_8)
        out.write((field shl 3) or 2)
        varint(out, b.size.toLong())
        out.write(b)
    }

    fun encode(m: CastMessage): ByteArray {
        val body = ByteArrayOutputStream()
        body.write(0x08); varint(body, 0)
        string(body, 2, m.source)
        string(body, 3, m.destination)
        string(body, 4, m.namespace)
        body.write(0x28); varint(body, 0)
        string(body, 6, m.payload)
        val b = body.toByteArray()
        val out = ByteArrayOutputStream(b.size + 4)
        out.write(b.size ushr 24 and 0xFF); out.write(b.size ushr 16 and 0xFF); out.write(b.size ushr 8 and 0xFF); out.write(b.size and 0xFF)
        out.write(b)
        return out.toByteArray()
    }

    /** Decodes the protobuf body (without the length prefix). */
    fun decode(b: ByteArray): CastMessage {
        var i = 0
        fun readVarint(): Long {
            var shift = 0; var r = 0L
            while (true) {
                val x = b[i++].toInt() and 0xFF
                r = r or ((x and 0x7F).toLong() shl shift)
                if (x and 0x80 == 0) return r
                shift += 7
            }
        }
        var source = ""; var dest = ""; var ns = ""; var payload = ""
        while (i < b.size) {
            val key = readVarint().toInt()
            val field = key ushr 3
            when (key and 7) {
                0 -> readVarint()
                2 -> {
                    val len = readVarint().toInt()
                    val s = String(b, i, len, Charsets.UTF_8)
                    i += len
                    when (field) { 2 -> source = s; 3 -> dest = s; 4 -> ns = s; 6 -> payload = s }
                }
                5 -> i += 4
                1 -> i += 8
                else -> throw IllegalStateException("Bad cast message")
            }
        }
        return CastMessage(source, dest, ns, payload)
    }
}
