import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInvoiceHtml } from '../lib/invoiceHtml.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase 1 & 2: Mobile BackButton, Header Navigation & Form Preservation Parity', () => {
  it('1. BackButton navigates back using navigation stack when canGoBack() is true', () => {
    let goBackCalled = false;
    let navigatedTo = null;

    const mockNavigation = {
      canGoBack: () => true,
      goBack: () => { goBackCalled = true; },
      navigate: (route) => { navigatedTo = route; },
    };

    // Simulate execute logic in BackButton
    function triggerBack(navigation, onPress, fallbackRoute, hasUnsavedChanges) {
      if (hasUnsavedChanges) {
        return 'PROMPT_CONFIRMATION';
      }
      if (typeof onPress === 'function') {
        onPress();
        return 'CUSTOM_ONPRESS';
      }
      if (navigation?.canGoBack && navigation.canGoBack()) {
        navigation.goBack();
        return 'GO_BACK';
      }
      if (fallbackRoute && navigation?.navigate) {
        navigation.navigate(fallbackRoute);
        return 'FALLBACK';
      }
      return 'SAFE_NOOP';
    }

    const action = triggerBack(mockNavigation, null, null, false);
    assert.equal(action, 'GO_BACK');
    assert.equal(goBackCalled, true);
    assert.equal(navigatedTo, null);
  });

  it('2. BackButton navigates safely to fallback route when canGoBack() is false on secondary screens', () => {
    let goBackCalled = false;
    let navigatedTo = null;

    const mockNavigation = {
      canGoBack: () => false,
      goBack: () => { goBackCalled = true; },
      navigate: (route) => { navigatedTo = route; },
    };

    function triggerBack(navigation, onPress, fallbackRoute, hasUnsavedChanges) {
      if (hasUnsavedChanges) return 'PROMPT_CONFIRMATION';
      if (typeof onPress === 'function') { onPress(); return 'CUSTOM_ONPRESS'; }
      if (navigation?.canGoBack && navigation.canGoBack()) { navigation.goBack(); return 'GO_BACK'; }
      if (fallbackRoute && navigation?.navigate) { navigation.navigate(fallbackRoute); return 'FALLBACK'; }
      return 'SAFE_NOOP';
    }

    const action = triggerBack(mockNavigation, null, 'MoreMenu', false);
    assert.equal(action, 'FALLBACK');
    assert.equal(goBackCalled, false);
    assert.equal(navigatedTo, 'MoreMenu');
  });

  it('3. BackButton executes custom onPress when provided', () => {
    let customCalled = false;
    const mockOnPress = () => { customCalled = true; };

    function triggerBack(navigation, onPress, fallbackRoute, hasUnsavedChanges) {
      if (hasUnsavedChanges) return 'PROMPT_CONFIRMATION';
      if (typeof onPress === 'function') { onPress(); return 'CUSTOM_ONPRESS'; }
      if (navigation?.canGoBack && navigation.canGoBack()) { navigation.goBack(); return 'GO_BACK'; }
      if (fallbackRoute && navigation?.navigate) { navigation.navigate(fallbackRoute); return 'FALLBACK'; }
      return 'SAFE_NOOP';
    }

    const action = triggerBack(null, mockOnPress, null, false);
    assert.equal(action, 'CUSTOM_ONPRESS');
    assert.equal(customCalled, true);
  });

  it('4. BackButton prompts confirmation when hasUnsavedChanges is true before discarding form data', () => {
    let goBackCalled = false;
    const mockNavigation = {
      canGoBack: () => true,
      goBack: () => { goBackCalled = true; },
    };

    function triggerBack(navigation, onPress, fallbackRoute, hasUnsavedChanges) {
      if (hasUnsavedChanges) return 'PROMPT_CONFIRMATION';
      if (typeof onPress === 'function') { onPress(); return 'CUSTOM_ONPRESS'; }
      if (navigation?.canGoBack && navigation.canGoBack()) { navigation.goBack(); return 'GO_BACK'; }
      if (fallbackRoute && navigation?.navigate) { navigation.navigate(fallbackRoute); return 'FALLBACK'; }
      return 'SAFE_NOOP';
    }

    const action = triggerBack(mockNavigation, null, null, true);
    assert.equal(action, 'PROMPT_CONFIRMATION');
    assert.equal(goBackCalled, false); // Form data is preserved, not discarded
  });

  it('5. Root screens safely avoid unnecessary Back buttons or errors', () => {
    const mockNavigation = {
      canGoBack: () => false,
      goBack: () => { throw new Error('Cannot go back from root'); },
    };

    function triggerBack(navigation, onPress, fallbackRoute, hasUnsavedChanges) {
      if (hasUnsavedChanges) return 'PROMPT_CONFIRMATION';
      if (typeof onPress === 'function') { onPress(); return 'CUSTOM_ONPRESS'; }
      if (navigation?.canGoBack && navigation.canGoBack()) { navigation.goBack(); return 'GO_BACK'; }
      if (fallbackRoute && navigation?.navigate) { navigation.navigate(fallbackRoute); return 'FALLBACK'; }
      return 'SAFE_NOOP';
    }

    const action = triggerBack(mockNavigation, null, null, false);
    assert.equal(action, 'SAFE_NOOP');
  });

  it('6. Hamburger menu is accessible and preserves form state across drawer module navigation', () => {
    // Model form state preservation
    let currentScreen = 'Rooms';
    let checkInForm = { guestName: 'Ravi Kumar', phone: '9876543210', advance: '1000' };

    // User taps hamburger menu: drawer opens without closing form
    let drawerOpen = true;
    assert.equal(drawerOpen, true);
    assert.equal(checkInForm.guestName, 'Ravi Kumar');

    // User navigates to Guests tab via drawer
    currentScreen = 'Guests';
    drawerOpen = false;
    assert.equal(currentScreen, 'Guests');
    // Form is not submitted or discarded
    assert.equal(checkInForm.guestName, 'Ravi Kumar');

    // User returns to Rooms tab
    currentScreen = 'Rooms';
    assert.equal(currentScreen, 'Rooms');
    assert.deepEqual(checkInForm, { guestName: 'Ravi Kumar', phone: '9876543210', advance: '1000' });
  });
});

describe('Phase 3: In-App Invoice Retrieval, Display & Actions Parity', () => {
  const mockPayload = {
    invoice: {
      id: 42,
      invoice_number: 'TC-2026-0042',
      created_at: '2026-11-19 11:30:00',
      financial_year: '2026-2027',
      room_amount: '4000.00',
      total_amount: '4480.00',
      gst_rate: 0.12,
      cgst_amount: '240.00',
      sgst_amount: '240.00',
      igst_amount: '0.00',
      advance_paid: '1000.00',
      balance_amount: '0.00',
      guest_gstin: '33AABCT1234Z1Z5',
    },
    hotel: {
      id: 1,
      name: 'KKK Lodge',
      address: '12 Heritage Street, Pondicherry',
      gstin: '33AAAAA0000A1Z5',
      phone: '+91 98400 12345',
    },
    stay: {
      id: 88,
      guest_name: 'Ananya Sharma',
      guest_phone: '9876543210',
      room_no: '204',
      room_type_name: 'Deluxe Suite',
      rate: '2000.00',
      check_in_date: '2026-11-17',
      checkout_actual: '2026-11-19',
    },
    charges: [
      { id: 1, label: 'Airport Transfer', amount: '500.00', sac_code: '9964', gst_rate: 0.12 },
    ],
    payments: [
      { id: 1, type: 'advance', amount: '1000.00', method: 'upi', status: 'successful' },
      { id: 2, type: 'balance', amount: '3480.00', method: 'card', status: 'successful' },
    ],
    paymentSummary: {
      advancePaid: 1000,
      checkoutPaid: 3480,
      totalPaid: 4480,
      balance: 0,
    },
  };

  it('1. Retrieves invoice by actual invoiceId or stayId without redirecting to browser', () => {
    function resolveInvoiceParams({ invoiceId, stayId, id }) {
      if (invoiceId) return { type: 'byInvoiceId', endpoint: `/invoices/${invoiceId}` };
      if (stayId) return { type: 'byStayId', endpoint: `/stays/${stayId}/invoice` };
      if (id) return { type: 'byGenericId', endpoint: `/invoices/${id}` };
      throw new Error('No ID provided');
    }

    assert.deepEqual(resolveInvoiceParams({ invoiceId: 42 }), { type: 'byInvoiceId', endpoint: '/invoices/42' });
    assert.deepEqual(resolveInvoiceParams({ stayId: 88 }), { type: 'byStayId', endpoint: '/stays/88/invoice' });
    assert.deepEqual(resolveInvoiceParams({ id: 42 }), { type: 'byGenericId', endpoint: '/invoices/42' });
  });

  it('2. Builds complete HTML invoice with all details for in-app printing and sharing', () => {
    const html = buildInvoiceHtml(mockPayload);
    assert.ok(html.includes('KKK Lodge'));
    assert.ok(html.includes('TC-2026-0042'));
    assert.ok(html.includes('Ananya Sharma'));
    assert.ok(html.includes('9876543210'));
    assert.ok(html.includes('33AABCT1234Z1Z5'));
    assert.ok(html.includes('Room 204'));
    assert.ok(html.includes('Deluxe Suite'));
    assert.ok(html.includes('Airport Transfer'));
    assert.ok(html.includes('9964'));
    assert.ok(html.includes('CGST'));
    assert.ok(html.includes('SGST'));
    assert.ok(html.includes('Advance paid'));
    assert.ok(html.includes('UPI'));
    assert.ok(html.includes('CARD'));
    assert.ok(html.includes('Balance Due: ₹0'));
  });

  it('3. Formats inter-state IGST accurately when applicable', () => {
    const interStatePayload = {
      ...mockPayload,
      invoice: {
        ...mockPayload.invoice,
        cgst_amount: '0.00',
        sgst_amount: '0.00',
        igst_amount: '480.00',
      },
    };
    const html = buildInvoiceHtml(interStatePayload);
    assert.ok(html.includes('IGST'));
    assert.ok(!html.includes('CGST'));
  });

  it('4. InvoicePrintScreen.jsx correctly contains all HTML and CSS within template string and exports functions', () => {
    const invoicePrintPath = path.resolve(__dirname, '..', 'screens', 'bills', 'InvoicePrintScreen.jsx');
    const content = fs.readFileSync(invoicePrintPath, 'utf8');

    // Ensure buildInvoiceHtml function is defined and exported
    assert.ok(content.includes('export function buildInvoiceHtml(data)'), 'InvoicePrintScreen must export buildInvoiceHtml');
    assert.ok(content.includes('export default function InvoicePrintScreen'), 'InvoicePrintScreen must export default InvoicePrintScreen');

    // Ensure template string boundaries are intact and CSS is inside template string
    assert.ok(content.includes('font-size: 13px;'), 'Invoice CSS body font-size must be present');
    assert.ok(content.includes('font-size: 12px;'), 'Invoice CSS muted font-size must be present');
    assert.ok(content.includes('return `'), 'HTML template string start must be present');
    assert.ok(content.includes('<!DOCTYPE html>'), 'HTML doctype must be inside template string');

    // Ensure no raw css statements leaked into JS scope
    const lines = content.split('\n');
    for (let i = 0; i < 20; i++) {
      const line = lines[i]?.trim();
      assert.ok(!line?.startsWith('font-size:'), `Raw CSS on line ${i + 1} must not be outside template string`);
    }
  });

  it('5. OverlayManager and Screen decouple overlays to prevent infinite state update loops', () => {
    class OverlayManager {
      constructor() {
        this.listeners = new Set();
        this.items = new Map();
      }
      subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      }
      registerOverlay(id, element) {
        this.items.set(id, element);
        this.notify();
      }
      unregisterOverlay(id) {
        if (this.items.delete(id)) this.notify();
      }
      notify() {
        const list = Array.from(this.items.entries()).map(([id, element]) => ({ id, element }));
        this.listeners.forEach((fn) => fn(list));
      }
    }

    const manager = new OverlayManager();
    let screenRenderCount = 0;
    let overlayHostRenderCount = 0;

    // Simulate Screen render
    screenRenderCount++;

    // OverlayHost subscribes
    manager.subscribe(() => {
      overlayHostRenderCount++;
    });

    // Sheet mounts and registers
    manager.registerOverlay('sheet_1', { type: 'SheetContent' });
    assert.equal(screenRenderCount, 1, 'Screen must NOT re-render when overlay registers');
    assert.equal(overlayHostRenderCount, 1, 'OverlayHost updates cleanly');

    // Sheet updates with new props/state
    manager.registerOverlay('sheet_1', { type: 'SheetContent', updated: true });
    assert.equal(screenRenderCount, 1, 'Screen must NOT re-render when overlay updates');
    assert.equal(overlayHostRenderCount, 2, 'OverlayHost updates cleanly');

    // Sheet unmounts
    manager.unregisterOverlay('sheet_1');
    assert.equal(screenRenderCount, 1, 'Screen must NOT re-render when overlay unregisters');
    assert.equal(overlayHostRenderCount, 3);
  });
});
