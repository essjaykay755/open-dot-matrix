import { useEffect, useRef } from 'react'
import { loadLastDevice } from './deviceMemory'
import type { MatrixClient } from './matrixClient'
import type { PreviewContent } from './preview'
import { CONDITION_LABELS } from './weather'
import { WeatherService } from './weatherService'

const CLOCK = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

/**
 * Owns the app-wide weather schedule: it keeps running whichever tab is open and while the
 * window is hidden in the tray, and reconnects the remembered panel when it needs to send.
 */
export function useWeatherService(
  client: MatrixClient,
  onPreview: (content: PreviewContent) => void
): WeatherService {
  const serviceRef = useRef<WeatherService | null>(null)
  if (!serviceRef.current) {
    serviceRef.current = new WeatherService({
      ensureConnected: async (autoReconnect) => {
        if (client.isConnected && !client.isDemo) return true
        if (autoReconnect) {
          if (await client.reconnectBle()) return true
          const last = loadLastDevice()
          if (last && window.desktop) {
            await window.desktop.autoConnectBluetooth(last.deviceId)
            if (client.isConnected && !client.isDemo) return true
          }
        }
        return client.isConnected
      },
      send: (gifBytes) => client.sendGif(gifBytes),
      targetName: () => (client.isDemo ? 'the demo panel' : client.currentState.deviceName)
    })
  }
  const service = serviceRef.current

  const previewRef = useRef(onPreview)
  previewRef.current = onPreview

  useEffect(() => {
    window.__odmAutoConnect = () => client.connectBle().then(() => true, () => false)
    const offPreview = service.on('preview', (content) => previewRef.current(content))
    const offStatus = service.on('status', (status) => {
      const report = status.report
      const parts = ['Open Dot Matrix']
      if (report) {
        parts.push(`${report.location.name} ${Math.round(report.temperature)}° ${CONDITION_LABELS[report.condition]}`)
      }
      if (service.settings.autoUpdate && status.nextUpdate) parts.push(`next ${CLOCK.format(status.nextUpdate)}`)
      void window.desktop?.setTrayStatus(parts.join(' · '))
    })
    const offRefresh = window.desktop?.onWeatherRefreshRequest(() => void service.sendNow())
    const offResume = window.desktop?.onSystemResume(() => service.wake())
    service.start()

    return () => {
      service.stop()
      offPreview()
      offStatus()
      offRefresh?.()
      offResume?.()
      delete window.__odmAutoConnect
    }
  }, [client, service])

  return service
}
