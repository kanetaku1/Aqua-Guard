import { createHash } from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { connect, MqttClient } from 'mqtt';
import { ApiProblem } from '../http/problem';
import { PostgresService } from './postgres.service';
import { SensorIngestionService } from './sensor-ingestion.service';

const MAX_PAYLOAD_BYTES = 16 * 1024;

@Injectable()
export class MqttSensorSubscriberService implements OnModuleDestroy {
  private readonly logger = new Logger(MqttSensorSubscriberService.name);
  private client: MqttClient | null = null;
  private prefix = 'aquaguard/sensors';
  private ready: Promise<void> | null = null;

  constructor(
    private readonly postgres: PostgresService,
    private readonly ingestion: SensorIngestionService,
  ) {}

  start(): Promise<void> {
    if (this.client) return this.ready!;
    const url = process.env.MQTT_URL ?? `mqtt://127.0.0.1:${process.env.MQTT_PORT ?? '1883'}`;
    const prefix = process.env.MQTT_SENSOR_TOPIC_PREFIX ?? 'aquaguard/sensors';
    if (!/^[^+#/]+(?:\/[^+#/]+)*$/.test(prefix)) {
      throw new Error('MQTT_SENSOR_TOPIC_PREFIX must contain plain topic segments');
    }
    this.prefix = prefix;
    const filter = `${prefix}/+/readings`;
    const client = connect(url, {
      clientId: process.env.MQTT_CLIENT_ID ?? 'aquaguard-ingestion-local',
      clean: false, resubscribe: false, reconnectPeriod: 2_000, connectTimeout: 10_000,
      username: process.env.MQTT_USERNAME || undefined,
      password: process.env.MQTT_PASSWORD || undefined,
    });
    this.client = client;
    let signalReady: () => void;
    this.ready = new Promise<void>((resolve) => { signalReady = resolve; });
    client.handleMessage = (packet, done) => {
      const payload = Buffer.isBuffer(packet.payload)
        ? packet.payload : Buffer.from(packet.payload);
      void this.accept(packet.topic, payload).then(() => done()).catch((error) => {
        this.logger.error('MQTT sensor ingestion failed; reconnecting without acknowledgement', error);
        client.stream.destroy();
        done(error instanceof Error ? error : new Error('MQTT ingestion failed'));
      });
    };
    client.on('connect', (connack) => {
      if (connack.sessionPresent) {
        this.logger.log(`Resumed MQTT sensor subscription to ${filter}`);
        signalReady();
        return;
      }
      client.subscribe(filter, { qos: 1 }, (error, grants) => {
        if (error || !grants?.some((grant) => grant.topic === filter && grant.qos === 1)) {
          this.logger.error('MQTT sensor subscription failed', error);
          client.stream.destroy();
          return;
        }
        this.logger.log(`Subscribed to ${filter} at QoS 1`);
        signalReady();
      });
    });
    client.on('error', (error) => this.logger.error('MQTT connection error', error));
    return this.ready;
  }

  async accept(topic: string, payload: Buffer): Promise<void> {
    const prefix = `${this.prefix}/`;
    const suffix = '/readings';
    const topicDevice = topic.startsWith(prefix) && topic.endsWith(suffix)
      ? topic.slice(prefix.length, -suffix.length) : '';
    let reason: string | null = null;
    let event: unknown;
    if (!topicDevice || topicDevice.includes('/')) reason = 'invalid_topic';
    else if (payload.length > MAX_PAYLOAD_BYTES) reason = 'payload_too_large';
    else {
      try { event = JSON.parse(payload.toString('utf8')); }
      catch { reason = 'invalid_json'; }
    }
    if (!reason && (!event || typeof event !== 'object' || Array.isArray(event)
      || (event as Record<string, unknown>).deviceId !== topicDevice)) {
      reason = 'topic_device_mismatch';
    }
    if (!reason) {
      try { await this.ingestion.ingest(event); }
      catch (error) {
        if (error instanceof ApiProblem && [409, 422].includes(error.getStatus())) {
          const response = error.getResponse();
          reason = typeof response === 'object' && response !== null && 'code' in response
            && typeof response.code === 'string' ? response.code : 'invalid_sensor_event';
        } else throw error;
      }
    }
    if (reason) await this.reject(topic, payload, reason);
  }

  private async reject(topic: string, payload: Buffer, reason: string): Promise<void> {
    const digest = createHash('sha256').update(payload).digest('hex');
    await this.postgres.pool.query(
      `INSERT INTO mqtt_rejected_messages (topic,payload_sha256,payload_bytes,reason_code)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (topic,payload_sha256) DO UPDATE SET
         last_seen_at=now(),rejected_count=mqtt_rejected_messages.rejected_count+1,
         reason_code=EXCLUDED.reason_code`,
      [topic, digest, payload.length, reason],
    );
    this.logger.warn(`Rejected MQTT sensor message on ${topic}: ${reason}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.endAsync(true);
      this.client = null;
      this.ready = null;
    }
  }
}
