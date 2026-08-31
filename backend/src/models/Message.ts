import { Schema, model, Document, Types } from 'mongoose';

export interface IMessage extends Document {
  _id: Types.ObjectId;
  senderId: Types.ObjectId;
  receiverId: Types.ObjectId;
  content: string;
  createdAt: Date;
}

const messageSchema = new Schema<IMessage>({
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  receiverId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  content: { type: String, required: true, maxlength: 5000 },
  createdAt: { type: Date, default: Date.now },
});

// Primary access pattern: "give me messages between these two users, newest
// first" — this compound index serves both the pair lookup and the sort.
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, senderId: 1, createdAt: -1 });

// Supports retention/cleanup queries (oldest-first scans) independent of
// which pair sent them — relevant if this schema is ever extended beyond
// exactly two users.
messageSchema.index({ createdAt: 1 });

export const Message = model<IMessage>('Message', messageSchema);
