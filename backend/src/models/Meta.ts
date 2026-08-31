import { Schema, model, Document } from 'mongoose';

/**
 * A single-document collection used to maintain a running counter of total
 * messages, so we never have to run `countDocuments()` (a full collection
 * scan/estimate) on the hot path of sending a message.
 */
export interface IMeta extends Document {
  key: string;
  messageCount: number;
}

const metaSchema = new Schema<IMeta>({
  key: { type: String, required: true, unique: true },
  messageCount: { type: Number, required: true, default: 0 },
});

export const Meta = model<IMeta>('Meta', metaSchema);

export const MESSAGE_COUNTER_KEY = 'message_counter';
