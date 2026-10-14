export function playBatchReminder() {
  try {
    if (localStorage.getItem('rh_batch_reminder_enabled') !== 'true') return;
    const audioFile = localStorage.getItem('rh_batch_reminder_audio');
    if (audioFile) void new Audio(`/audio/${audioFile}`).play().catch(error => console.error('Failed to play completion reminder:', error));
  } catch (error) {
    console.error('Failed to play completion reminder:', error);
  }
}
