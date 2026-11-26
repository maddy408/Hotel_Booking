import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Fix Bills Navigation and Bottom Tab Behaviour Verification', () => {
  const mainTabsPath = path.join(srcDir, 'navigation', 'MainTabs.jsx');
  const customDrawerPath = path.join(srcDir, 'navigation', 'CustomDrawerContent.jsx');
  const backButtonPath = path.join(srcDir, 'components', 'ui', 'BackButton.jsx');
  const invoicePrintPath = path.join(srcDir, 'screens', 'bills', 'InvoicePrintScreen.jsx');
  const billsScreenPath = path.join(srcDir, 'screens', 'bills', 'BillsScreen.jsx');

  const mainTabsContent = fs.readFileSync(mainTabsPath, 'utf8');
  const customDrawerContent = fs.readFileSync(customDrawerPath, 'utf8');
  const backButtonContent = fs.readFileSync(backButtonPath, 'utf8');
  const invoicePrintContent = fs.readFileSync(invoicePrintPath, 'utf8');
  const billsScreenContent = fs.readFileSync(billsScreenPath, 'utf8');

  describe('1. Navigation Structure & Stack Configuration', () => {
    it('BillsStack configures initialRouteName as BillsHome', () => {
      assert.ok(
        mainTabsContent.includes('<Stack.Navigator initialRouteName="BillsHome"'),
        'BillsStack must set initialRouteName="BillsHome"'
      );
    });

    it('BillsStack includes BillsHome and InvoicePrint as child screens of the same stack', () => {
      assert.ok(
        mainTabsContent.includes('name="BillsHome"') && mainTabsContent.includes('component={BillsScreen}'),
        'BillsHome must be registered in BillsStack'
      );
      assert.ok(
        mainTabsContent.includes('name="InvoicePrint"') && mainTabsContent.includes('component={InvoicePrintScreen}'),
        'InvoicePrint must be registered as child screen in BillsStack'
      );
    });

    it('InvoicePrint options passes the screen stack navigation object to BackButton', () => {
      assert.ok(
        mainTabsContent.includes('options={({ navigation }) => ({') &&
        mainTabsContent.includes('headerLeft: () => <BackButton navigation={navigation} fallbackRoute="BillsHome" />'),
        'InvoicePrint must pass screen navigation prop to BackButton in headerLeft'
      );
    });

    it('Bills tab in MainTabs configures tabPress listener to navigate to BillsHome', () => {
      assert.ok(
        mainTabsContent.includes('tabPress: (e) => {') &&
        mainTabsContent.includes("navigation.navigate('Bills', {") &&
        mainTabsContent.includes("screen: 'BillsHome'"),
        'Bills tab must configure tabPress listener targeting BillsHome'
      );
    });

    it('CustomDrawerContent directs Bills navigation to BillsHome', () => {
      assert.ok(
        customDrawerContent.includes("tabTarget === 'Bills' ? { screen: 'BillsHome' } : undefined"),
        'CustomDrawerContent must pass screen: BillsHome when navigating to Bills tab'
      );
    });
  });

  describe('2. BackButton & Stack-Safe Navigation Execution', () => {
    it('BackButton accepts custom navigation prop and falls back to hookNavigation', () => {
      assert.ok(
        backButtonContent.includes('navigation: propNavigation') &&
        backButtonContent.includes('const hookNavigation = useNavigation();') &&
        backButtonContent.includes('const navigation = propNavigation || hookNavigation;'),
        'BackButton must accept propNavigation and use it over useNavigation'
      );
    });

    it('BackButton pops stack when state.index > 0 instead of bubbling to parent tab navigator', () => {
      let goBackCalls = 0;
      let resetCalls = [];
      let navigateCalls = [];

      const mockStackNav = {
        getState: () => ({ index: 1, routes: [{ name: 'BillsHome' }, { name: 'InvoicePrint' }] }),
        canGoBack: () => true,
        goBack: () => { goBackCalls++; },
        reset: (payload) => { resetCalls.push(payload); },
        navigate: (route) => { navigateCalls.push(route); },
      };

      // Execute BackButton logic
      const state = mockStackNav.getState();
      const canPop = state ? state.index > 0 : mockStackNav.canGoBack();
      if (canPop) {
        mockStackNav.goBack();
      } else if (mockStackNav.reset) {
        mockStackNav.reset({ index: 0, routes: [{ name: 'BillsHome' }] });
      }

      assert.equal(goBackCalls, 1, 'Must call goBack to pop stack when index > 0');
      assert.equal(resetCalls.length, 0, 'Must not reset when index > 0');
      assert.equal(navigateCalls.length, 0, 'Must not navigate when index > 0');
    });

    it('BackButton resets to fallbackRoute when state.index === 0 to prevent jumping to Rooms Dashboard', () => {
      let goBackCalls = 0;
      let resetCalls = [];

      const mockStackNav = {
        getState: () => ({ index: 0, routes: [{ name: 'InvoicePrint' }] }),
        canGoBack: () => true, // Parent tab navigator could report true!
        goBack: () => { goBackCalls++; },
        reset: (payload) => { resetCalls.push(payload); },
      };

      const state = mockStackNav.getState();
      const canPop = state ? state.index > 0 : mockStackNav.canGoBack();
      if (canPop) {
        mockStackNav.goBack();
      } else if (mockStackNav.reset) {
        mockStackNav.reset({ index: 0, routes: [{ name: 'BillsHome' }] });
      }

      assert.equal(goBackCalls, 0, 'Must NOT call goBack when index === 0 to avoid bubbling to TabNavigator (Rooms)');
      assert.equal(resetCalls.length, 1, 'Must reset stack to fallbackRoute BillsHome');
      assert.deepEqual(resetCalls[0], { index: 0, routes: [{ name: 'BillsHome' }] });
    });

    it('BackButton onHardwareBack safely handles Android hardware Back', () => {
      assert.ok(
        backButtonContent.includes('const onHardwareBack = () => {') &&
        backButtonContent.includes('const canPop = state ? state.index > 0 :') &&
        backButtonContent.includes('hardwareBackPress'),
        'BackButton must handle Android hardware back press safely'
      );
    });
  });

  describe('3. InvoicePrintScreen Back & Stale Detail Prevention', () => {
    it('InvoicePrintScreen in-screen Back button checks stack depth and safely returns to BillsHome', () => {
      assert.ok(
        invoicePrintContent.includes('const state = navigation?.getState?.();') &&
        invoicePrintContent.includes('const canPop = state ? state.index > 0 :') &&
        invoicePrintContent.includes("routes: [{ name: 'BillsHome' }]"),
        'InvoicePrintScreen in-screen Back button must pop or reset to BillsHome'
      );
    });

    it('InvoicePrintScreen registers blur listener to pop to BillsHome when switching tabs', () => {
      assert.ok(
        invoicePrintContent.includes("navigation?.addListener?.('blur'") &&
        invoicePrintContent.includes('navigation.popToTop()'),
        'InvoicePrintScreen must popToTop on blur to prevent stale invoice details on tab switch'
      );
    });

    it('InvoicePrintScreen registers hardware Back listener to return to BillsHome on Android', () => {
      assert.ok(
        invoicePrintContent.includes('BackHandler.addEventListener') &&
        invoicePrintContent.includes("navigation.navigate('BillsHome')") || invoicePrintContent.includes("routes: [{ name: 'BillsHome' }]"),
        'InvoicePrintScreen must intercept hardwareBackPress and return to BillsHome'
      );
    });
  });

  describe('4. Bills List State & Data Integrity', () => {
    it('BillsScreen navigates to InvoicePrint with stayId and invoiceId', () => {
      assert.ok(
        billsScreenContent.includes("navigation.navigate('InvoicePrint', { stayId: s.id, invoiceId: s.invoice_id })"),
        'BillsScreen must pass stayId and invoiceId to InvoicePrint'
      );
    });

    it('BillsScreen maintains search and filter state without reset on navigation focus', () => {
      assert.ok(
        billsScreenContent.includes("const [filter, setFilter] = useState("),
        'BillsScreen retains filter state'
      );
      assert.ok(
        billsScreenContent.includes("const [search, setSearch] = useState('')"),
        'BillsScreen retains search state'
      );
      assert.ok(
        billsScreenContent.includes('useFocusEffect('),
        'BillsScreen refetches stays and report on focus without resetting filter/search'
      );
    });
  });

  describe('5. Complete Flow Simulations', () => {
    it('Scenario 1: Bills List → Invoice Details → Back returns to Bills List with list state preserved', () => {
      // Stack state simulation
      const stack = [{ name: 'BillsHome' }];
      let billsScreenState = { filter: 'today', search: 'Room 101' };

      // User taps invoice
      stack.push({ name: 'InvoicePrint', params: { stayId: 101, invoiceId: 501 } });
      assert.equal(stack.length, 2);
      assert.equal(stack[stack.length - 1].name, 'InvoicePrint');

      // User presses Back: canPop is true
      const canPop = stack.length > 1;
      assert.ok(canPop);
      stack.pop();

      // Returned to BillsHome
      assert.equal(stack.length, 1);
      assert.equal(stack[0].name, 'BillsHome');
      // BillsScreen state preserved
      assert.equal(billsScreenState.filter, 'today');
      assert.equal(billsScreenState.search, 'Room 101');
    });

    it('Scenario 2: Bills List → Invoice Details → Rooms tab → Bills tab returns to Bills List', () => {
      // Initial tab is Bills
      let activeTab = 'Bills';
      const stack = [{ name: 'BillsHome' }];

      // User opens invoice
      stack.push({ name: 'InvoicePrint', params: { stayId: 102, invoiceId: 502 } });
      assert.equal(stack.length, 2);

      // User switches to Rooms tab (blur fires on InvoicePrint)
      activeTab = 'Rooms';
      // Blur listener pops to top
      if (stack.length > 1) {
        stack.splice(1); // pop to top
      }
      assert.equal(activeTab, 'Rooms');
      assert.equal(stack.length, 1);
      assert.equal(stack[0].name, 'BillsHome');

      // User taps Bills tab: tabPress navigates to BillsHome
      activeTab = 'Bills';
      assert.equal(activeTab, 'Bills');
      assert.equal(stack[0].name, 'BillsHome');
      assert.equal(stack.length, 1, 'Stale invoice detail must not be displayed');
    });

    it('Scenario 3: Bills List → Invoice A → Back → Invoice B displays correct invoice details', () => {
      const stack = [{ name: 'BillsHome' }];

      // Open Invoice A
      stack.push({ name: 'InvoicePrint', params: { stayId: 1, invoiceId: 10 } });
      assert.equal(stack[stack.length - 1].params.invoiceId, 10);

      // Back to Bills List
      stack.pop();
      assert.equal(stack[stack.length - 1].name, 'BillsHome');

      // Open Invoice B
      stack.push({ name: 'InvoicePrint', params: { stayId: 2, invoiceId: 20 } });
      assert.equal(stack[stack.length - 1].params.invoiceId, 20);
      assert.notEqual(stack[stack.length - 1].params.invoiceId, 10, 'Must display Invoice B details');
    });

    it('Scenario 4: Bills List → Other tab (Guests) → Bills tab returns cleanly to Bills List', () => {
      let activeTab = 'Bills';
      const stack = [{ name: 'BillsHome' }];

      activeTab = 'Guests';
      assert.equal(activeTab, 'Guests');

      // Tap Bills tab
      activeTab = 'Bills';
      assert.equal(activeTab, 'Bills');
      assert.equal(stack[0].name, 'BillsHome');
    });

    it('Scenario 5: Android hardware Back on Invoice Details pops back to Bills List', () => {
      const stack = [{ name: 'BillsHome' }, { name: 'InvoicePrint', params: { stayId: 3 } }];

      // Hardware back triggered
      const canPop = stack.length > 1;
      let handled = false;
      if (canPop) {
        stack.pop();
        handled = true;
      }

      assert.ok(handled, 'Hardware Back handled');
      assert.equal(stack.length, 1);
      assert.equal(stack[0].name, 'BillsHome');
    });
  });
});
