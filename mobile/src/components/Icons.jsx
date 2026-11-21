import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

/** Exact same icon paths as frontend/src/components/Layout.jsx's ALL_TABS, as RN SVG components. */
const base = { fill: 'none', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

export function RoomsIcon({ color = '#fff', size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
      <Path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9" />
    </Svg>
  );
}

export function BookingsIcon({ color = '#fff', size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
      <Rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <Line x1="16" y1="2" x2="16" y2="6" />
      <Line x1="8" y1="2" x2="8" y2="6" />
      <Line x1="3" y1="10" x2="21" y2="10" />
    </Svg>
  );
}

export function DailyOpsIcon({ color = '#fff', size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
      <Circle cx="12" cy="12" r="5" />
      <Line x1="12" y1="1" x2="12" y2="3" />
      <Line x1="12" y1="21" x2="12" y2="23" />
      <Line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <Line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <Line x1="1" y1="12" x2="3" y2="12" />
      <Line x1="21" y1="12" x2="23" y2="12" />
      <Line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <Line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </Svg>
  );
}

export function GuestsIcon({ color = '#fff', size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
      <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <Circle cx="9" cy="7" r="4" />
      <Path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Svg>
  );
}

export function BillsIcon({ color = '#fff', size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <Polyline points="14 2 14 8 20 8" />
      <Line x1="16" y1="13" x2="8" y2="13" />
      <Line x1="16" y1="17" x2="8" y2="17" />
      <Polyline points="10 9 9 9 8 9" />
    </Svg>
  );
}

export function ReportsIcon({ color = '#fff', size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
      <Line x1="18" y1="20" x2="18" y2="10" />
      <Line x1="12" y1="20" x2="12" y2="4" />
      <Line x1="6" y1="20" x2="6" y2="14" />
    </Svg>
  );
}

export function RoomMasterIcon({ color = '#fff', size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
      <Path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <Polyline points="9 22 9 12 15 12 15 22" />
    </Svg>
  );
}

export function UsersIcon({ color = '#fff', size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Circle cx="12" cy="7" r="4" />
    </Svg>
  );
}

export function SettingsIcon({ color = '#fff', size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
      <Circle cx="12" cy="12" r="3" />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  );
}

export function MoreIcon({ color = '#fff', size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
      <Circle cx="12" cy="12" r="1.5" />
      <Circle cx="19" cy="12" r="1.5" />
      <Circle cx="5" cy="12" r="1.5" />
    </Svg>
  );
}

export function CrestIcon({ color = '#fff', size = 22 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base} strokeWidth={1.8}>
      <Path d="M12 3c-1.5 3-4 7-8 9 2.5 1 5.5 1 8-1 2.5 2 5.5 2 8 1-4-2-6.5-6-8-9Z" />
      <Path d="M12 11c-2 2.5-5 4-8 4 2 2 5 2.5 8 0 3 2.5 6 2 8 0-3 0-6-1.5-8-4Z" />
      <Path d="M12 15c-1 2-3 4-6 4 2 1.5 4 1.5 6 0 2 1.5 4 1.5 6 0-3 0-5-2-6-4Z" />
    </Svg>
  );
}

export function LogoutIcon({ color = '#fff', size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <Polyline points="16 17 21 12 16 7" />
      <Line x1="21" y1="12" x2="9" y2="12" />
    </Svg>
  );
}

export function ChevronRightIcon({ color = '#94A3B8', size = 16 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
      <Polyline points="9 18 15 12 9 6" />
    </Svg>
  );
}

export function MenuIcon({ color = '#fff', size = 22 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
      <Line x1="3" y1="12" x2="21" y2="12" />
      <Line x1="3" y1="6" x2="21" y2="6" />
      <Line x1="3" y1="18" x2="21" y2="18" />
    </Svg>
  );
}

export function ArrowLeftIcon({ color = '#fff', size = 22 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
      <Line x1="19" y1="12" x2="5" y2="12" />
      <Polyline points="12 19 5 12 12 5" />
    </Svg>
  );
}

export function EyeIcon({ color = '#64748B', size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
      <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <Circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

export function EyeOffIcon({ color = '#64748B', size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
      <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <Line x1="1" y1="1" x2="23" y2="23" />
    </Svg>
  );
}

export function WhatsAppIcon({ color = '#FFFFFF', size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.076-1.109-.057-.27-.087-.604-.202-1.026-.384-1.785-.772-2.951-2.593-3.04-2.712-.089-.12-1.006-1.336-1.006-2.55 0-1.213.636-1.81.862-2.057.226-.247.492-.308.656-.308.164 0 .329.002.473.01.152.008.356-.058.556.423.206.494.7 1.706.762 1.83.061.123.102.268.02.43-.082.164-.123.266-.246.411-.123.144-.26.322-.37.432-.124.123-.253.256-.109.503.144.246.638 1.054 1.368 1.705.94.838 1.733 1.098 1.98 1.22.246.124.39.103.534-.062.144-.164.617-.719.781-.966.164-.246.328-.205.553-.123.226.082 1.437.678 1.684.801.246.124.41.185.472.288.061.103.061.597-.083 1.002z" />
    </Svg>
  );
}
