import { CalendarDays, History, LayoutDashboard, Settings } from 'lucide-react';

export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/history', label: 'History', icon: History },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export const ADD_EVENT_PATH = '/events/new';
