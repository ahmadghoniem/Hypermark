import { storage } from './storage';
import type { InputMethod } from '../types';

const STORAGE_KEY = 'hypermark-input-method';
const DEFAULT_METHOD: InputMethod = 'drag';

export function getInputMethod(): InputMethod {
  const saved = storage.getItem(STORAGE_KEY);
  return saved === 'drag' || saved === 'pinpoint' ? saved : DEFAULT_METHOD;
}

export function saveInputMethod(method: InputMethod): void {
  storage.setItem(STORAGE_KEY, method);
}
