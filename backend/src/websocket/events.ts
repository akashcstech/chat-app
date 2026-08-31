import { EventEmitter } from 'events';
import { IMessage } from '../models/Message';

export const chatEvents = new EventEmitter();

export const MESSAGE_CREATED = 'message:created';

export function emitMessageCreated(message: IMessage): void {
  chatEvents.emit(MESSAGE_CREATED, message);
}
