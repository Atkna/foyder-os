(function (root) {
  'use strict';

  const localDay = date => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

  // Şu anda bildirim gösterilmesi gereken açık görevler.
  // repeat açıkken: görev tamamlanana kadar her gün hatırlatma saatinde, günde en fazla bir kez.
  // repeat kapalıyken: yalnızca ilk bildirim.
  function due(tasks, now, repeat) {
    return (tasks || []).filter(task => {
      if (task.status === 'done' || !task.reminderAt) return false;
      const reminder = new Date(task.reminderAt);
      if (Number.isNaN(reminder.getTime()) || reminder > now) return false;
      if (!task.notifiedAt) return true;
      if (!repeat) return false;
      const notified = new Date(task.notifiedAt);
      if (Number.isNaN(notified.getTime())) return true;
      const todaySlot = new Date(now.getFullYear(), now.getMonth(), now.getDate(), reminder.getHours(), reminder.getMinutes());
      return todaySlot <= now && localDay(notified) !== localDay(now);
    });
  }

  // Aynı anda çok sayıda görev varsa ekranı bildirimle doldurmak yerine tek özet göster.
  function messages(tasks) {
    if (tasks.length <= 3) return tasks.map(task => ({ title: 'Hafıza · Görev zamanı', body: task.title, taskId: task.id }));
    const preview = tasks.slice(0, 3).map(task => `• ${task.title.length > 70 ? `${task.title.slice(0, 67)}…` : task.title}`).join('\n');
    return [{ title: `Hafıza · ${tasks.length} görev için hatırlatma`, body: `${preview}\n… ve ${tasks.length - 3} görev daha`, taskId: '' }];
  }

  const api = { due, messages };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Reminders = api;
})(typeof window !== 'undefined' ? window : globalThis);
