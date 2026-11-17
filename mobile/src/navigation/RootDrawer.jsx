import { createDrawerNavigator } from '@react-navigation/drawer';
import MainTabs from './MainTabs.jsx';
import CustomDrawerContent from './CustomDrawerContent.jsx';
import { colors } from '../theme/theme';

const Drawer = createDrawerNavigator();

export default function RootDrawer() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
        drawerStyle: {
          backgroundColor: colors.surface,
          width: 300,
        },
        overlayColor: 'rgba(7, 7, 59, 0.65)',
        swipeEdgeWidth: 80,
      }}
    >
      <Drawer.Screen name="MainTabs" component={MainTabs} />
    </Drawer.Navigator>
  );
}
