// A centralized place for reusable calendar utility functions.

export function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

export function getEndOfWeek(date) {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return end;
}

export function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export function timeToSlotIndex(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 2 + (m === 30 ? 1 : 0);
}

export function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatTime(timeStr, includePeriod = true) {
  if (!timeStr) return '';
  
  let h, m;
  if (typeof timeStr === 'string') {
    [h, m] = timeStr.split(':').map(Number);
  } else {
    h = timeStr.getHours();
    m = timeStr.getMinutes();
  }
  
  if (!includePeriod) return `${h}:${String(m).padStart(2, '0')}`;
  
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export function ensureTimeFormat(timeStr) {
  if (!timeStr) return '00:00';
  
  if (typeof timeStr === 'string') {
    const [hours, minutes] = timeStr.split(':');
    return `${String(hours).padStart(2, '0')}:${String(minutes || '00').padStart(2, '0')}`;
  }
  
  return '00:00';
}

export function escapeHTML(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
