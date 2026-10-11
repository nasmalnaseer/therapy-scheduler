import React from 'react';
import { STATUS_LABELS } from '../utils/constants';
import { statusOf } from '../utils/scheduling';

export default function StatusBadge({ session }) {
  const st = statusOf(session);
  return <span className={`badge ${st}`}>{STATUS_LABELS[st] || st}</span>;
}
