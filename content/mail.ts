export interface Letter {
  id: string;
  from: string;
  subject: string;
  body: string;
  date: string; // ISO
  unread?: boolean;
  egg?: boolean;
}

export const mail: Letter[] = [
  {
    id: "welcome",
    from: "Wii",
    subject: "Welcome to your Message Board",
    body: "Today has been a good day. You've clicked 1 channel. The Wii remembers.",
    date: new Date().toISOString(),
    unread: true,
  },
  {
    id: "daily",
    from: "Today's Accomplishments",
    subject: "Report",
    body: "• Opened the fridge: 4 times\n• Cried at a TV ad: 1 time\n• Felt nostalgic for 2008: constantly",
    date: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    unread: true,
    egg: true,
  },
  {
    id: "reggie",
    from: "Reggie Fils-Aimé",
    subject: "My body is ready",
    body: "My body is ready. My body has been ready. Ship it.",
    date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    egg: true,
  },
  {
    id: "signal",
    from: "Weather Channel",
    subject: "Forecast",
    body: "Today: slight chance of inspiration. Tonight: partly existential.",
    date: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
  },
];
