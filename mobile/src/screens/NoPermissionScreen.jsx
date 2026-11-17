import Screen, { EmptyState } from '../components/ui/Screen.jsx';

export default function NoPermissionScreen() {
  return (
    <Screen>
      <EmptyState title="You do not have permission to view this page." />
    </Screen>
  );
}
