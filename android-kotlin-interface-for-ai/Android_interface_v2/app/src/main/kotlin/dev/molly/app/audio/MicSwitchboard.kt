package dev.molly.app.audio

import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.concurrent.CopyOnWriteArrayList

class MicSwitchboard(
  private val audioManager: AudioManager,
  private val scope: CoroutineScope,
  private val sampleRate: Int = 16_000,
) {
  fun interface Consumer {
    fun onFrame(pcm: ShortArray, length: Int)
  }

  private data class Sink(
    val consumer: Consumer,
    val ring: ArrayDeque<ShortArray>,
    val maxFrames: Int,
  )

  private val sinks = CopyOnWriteArrayList<Sink>()
  private var captureJob: Job? = null
  private var record: AudioRecord? = null
  @Volatile private var hasFocus = false

  private val focusRequest by lazy {
    AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build(),
      )
      .setOnAudioFocusChangeListener { change ->
        when (change) {
          AudioManager.AUDIOFOCUS_GAIN -> {
            hasFocus = true
            resumeCapture()
          }
          AudioManager.AUDIOFOCUS_LOSS,
          AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
            hasFocus = false
            pauseCapture()
          }
        }
      }
      .build()
  }

  fun addConsumer(consumer: Consumer, maxBufferedFrames: Int = 32) {
    sinks.add(Sink(consumer, ArrayDeque(), maxBufferedFrames))
  }

  @androidx.annotation.RequiresPermission(android.Manifest.permission.RECORD_AUDIO)
  fun start() {
    if (captureJob?.isActive == true) return
    hasFocus =
      audioManager.requestAudioFocus(focusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    openRecord()
    captureJob = scope.launch(Dispatchers.Default) { captureLoop() }
  }

  fun stop() {
    captureJob?.cancel()
    captureJob = null
    record?.run {
      try {
        stop()
      } catch (_: Throwable) {
      }
      release()
    }
    record = null
    audioManager.abandonAudioFocusRequest(focusRequest)
    hasFocus = false
  }

  private fun openRecord() {
    val minBuf =
      AudioRecord.getMinBufferSize(
        sampleRate,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
      ).coerceAtLeast(sampleRate / 5 * 2)

    record =
      AudioRecord(
        MediaRecorder.AudioSource.VOICE_RECOGNITION,
        sampleRate,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        minBuf,
      )
  }

  private suspend fun captureLoop() {
    val frameSize = sampleRate / 10
    val buf = ShortArray(frameSize)

    try {
      while (scope.isActive) {
        if (!hasFocus) {
          delay(100)
          continue
        }

        val rec = record ?: break
        if (rec.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
          try {
            rec.startRecording()
          } catch (t: Throwable) {
            Log.e(TAG, "startRecording", t)
            delay(200)
            continue
          }
        }

        val n = rec.read(buf, 0, frameSize)
        if (n > 0) fanOut(buf, n)
      }
    } finally {
      try {
        record?.stop()
      } catch (_: Throwable) {
      }
    }
  }

  private fun fanOut(src: ShortArray, len: Int) {
    for (sink in sinks) {
      val frame = src.copyOf(len)
      if (sink.ring.size >= sink.maxFrames) sink.ring.removeFirst()
      sink.ring.addLast(frame)
      try {
        sink.consumer.onFrame(frame, len)
      } catch (t: Throwable) {
        Log.w(TAG, "consumer threw", t)
      }
    }
  }

  private fun pauseCapture() {
    try {
      record?.stop()
    } catch (_: Throwable) {
    }
    Log.i(TAG, "mic paused (focus lost)")
  }

  private fun resumeCapture() {
    Log.i(TAG, "mic resumed (focus regained)")
  }

  companion object {
    private const val TAG = "MicSwitchboard"
  }
}
