package expo.modules.t3agentnotifications

import android.content.Context
import org.json.JSONObject

/**
 * Merge independently delivered sources locally; neither Connect nor a paired host owns the other
 * sources.
 */
internal object AgentActivitySnapshots {
  private const val STORE = "t3-agent-activity-snapshots"
  private const val RUNNING_LIFETIME_MS = 2 * 60 * 60 * 1000L
  const val CONNECT = "connect"

  fun update(context: Context, source: String, data: Map<String, String>) {
    val prefs = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
    val updatedAt = data["updated_at"]?.toLongOrNull() ?: return
    if (updatedAt < prefs.getLong("$source:updatedAt", 0)) return
    prefs
      .edit()
      .putString(source, JSONObject(data).toString())
      .putLong("$source:updatedAt", updatedAt)
      .apply()
  }

  fun remove(context: Context, source: String) {
    context
      .getSharedPreferences(STORE, Context.MODE_PRIVATE)
      .edit()
      .remove(source)
      .remove("$source:updatedAt")
      .apply()
  }

  fun merged(context: Context, now: Long = System.currentTimeMillis()): Map<String, String> {
    val prefs = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
    val sources =
      prefs.all.keys
        .filter { !it.endsWith(":updatedAt") }
        .mapNotNull { source ->
          val raw = prefs.getString(source, null) ?: return@mapNotNull null
          val data =
            runCatching {
              val json = JSONObject(raw)
              json.keys().asSequence().associateWith { json.getString(it) }
            }
              .getOrNull() ?: return@mapNotNull null
          val updatedAt = data["updated_at"]?.toLongOrNull() ?: return@mapNotNull null
          val expiresAt =
            data["activity_expires_at"]?.toLongOrNull()
              ?: if (data["active"] == "true") updatedAt + RUNNING_LIFETIME_MS else 0L
          (data + ("activity_expires_at" to expiresAt.toString())).takeIf { expiresAt > now }
        }
    if (sources.size == 1) return sources.single()
    val ordered = sources.sortedBy { priority(activityPhase(it, activityRows(it))) }
    val hero = ordered.firstOrNull().orEmpty()
    val rows =
      ordered
        .flatMap(::activityRows)
        .sortedBy { priority(ActivityPhase.forStatus(it.status)) }
        .take(5)
    val activeCount = sources.sumOf {
      it["activity_active_count"]?.toIntOrNull()?.coerceAtLeast(0)
        ?: if (it["active"] == "true") 1 else 0
    }
    val attentionCount = sources.sumOf {
      it["activity_attention_count"]?.toIntOrNull()?.coerceAtLeast(0) ?: 0
    }
    val expiries = sources.mapNotNull { it["activity_expires_at"]?.toLongOrNull() }
    val expiry = expiries.maxOrNull() ?: 0L
    return hero.filterKeys { !it.startsWith("activity_line_") } +
      mapOf(
        "active" to (activeCount > 0).toString(),
        "activity_active_count" to activeCount.toString(),
        "activity_attention_count" to attentionCount.toString(),
        "activity_expires_at" to expiry.toString(),
        "activity_refresh_at" to (expiries.minOrNull() ?: 0L).toString(),
      ) +
      rows
        .mapIndexed { index, row ->
          "activity_line_$index" to "${row.status}\t${row.title}\t${row.project}"
        }
        .toMap()
  }

  private fun priority(phase: ActivityPhase?): Int =
    when {
      phase?.needsUser == true -> 0
      phase == ActivityPhase.FAILED -> 1
      phase == ActivityPhase.STARTING || phase == ActivityPhase.RUNNING -> 2
      else -> 3
    }
}
