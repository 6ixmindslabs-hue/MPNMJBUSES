export class SystemHealth {
  constructor(io) {
    this.io = io;
    this.metrics = {
      telemetryIngestionRate: 0,
      realtimeBroadcastRate: 0,
      activeVehicleCount: 0,
      offlineVehicleCount: 0,
      averageGpsConfidence: 100,
      backendLatency: 0,
    };
    
    // Internal counters
    this.ingestionCounter = 0;
    this.broadcastCounter = 0;
    
    // Start metric calculation interval (e.g. every 2 seconds compute Hz)
    setInterval(() => this.calculateMetrics(), 2000);
  }

  recordIngestion() {
    this.ingestionCounter++;
  }

  recordBroadcast() {
    this.broadcastCounter++;
  }

  updateFleetStats(activeCount, offlineCount, avgConfidence) {
    this.metrics.activeVehicleCount = activeCount;
    this.metrics.offlineVehicleCount = offlineCount;
    if (avgConfidence !== null) {
      this.metrics.averageGpsConfidence = avgConfidence;
    }
  }

  calculateMetrics() {
    // Calculate raw Hz (events per second) 
    this.metrics.telemetryIngestionRate = (this.ingestionCounter / 2).toFixed(1);
    this.metrics.realtimeBroadcastRate = (this.broadcastCounter / 2).toFixed(1);
    
    // Reset counters
    this.ingestionCounter = 0;
    this.broadcastCounter = 0;

    // Simulate backend processing latency (production: time delta of packet entering vs leaving)
    this.metrics.backendLatency = Math.floor(Math.random() * 15 + 10); 

    // Broadcast globally to admin dashboard channel
    this.io.to('admin:system_health').emit('fleet:system_health', this.metrics);
  }
}
