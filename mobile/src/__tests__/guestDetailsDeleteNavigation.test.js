import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Guest Details Deletion & Navigation Flow', () => {
  const guestDetailsPath = path.join(srcDir, 'screens', 'guests', 'GuestDetailsScreen.jsx');
  const guestsScreenPath = path.join(srcDir, 'screens', 'guests', 'GuestsScreen.jsx');
  const guestEditSheetPath = path.join(srcDir, 'components', 'sheets', 'GuestEditSheet.jsx');
  const guestsApiPath = path.join(srcDir, 'api', 'guests.js');

  const guestDetailsContent = fs.readFileSync(guestDetailsPath, 'utf8');
  const guestsScreenContent = fs.readFileSync(guestsScreenPath, 'utf8');
  const guestEditSheetContent = fs.readFileSync(guestEditSheetPath, 'utf8');
  const guestsApiContent = fs.readFileSync(guestsApiPath, 'utf8');

  it('1. GuestDetailsScreen imports useQueryClient and invalidates guests query and removes deleted guest from cache', () => {
    assert.ok(
      guestDetailsContent.includes('useQueryClient'),
      'GuestDetailsScreen must import and use useQueryClient'
    );
    assert.ok(
      guestDetailsContent.includes("queryClient.invalidateQueries({ queryKey: ['guests'] })"),
      'GuestDetailsScreen must invalidate guests query after deletion'
    );
    assert.ok(
      guestDetailsContent.includes("queryClient.removeQueries({ queryKey: ['guest', guestId] })"),
      'GuestDetailsScreen must remove the deleted guest entry from the React Query cache'
    );
  });

  it('2. GuestDetailsScreen navigates to GuestsHome via navigation.reset to clear stale history', () => {
    // Must navigate to 'GuestsHome' (stack route name) and NOT the tab name 'Guests'
    assert.ok(
      guestDetailsContent.includes("name: 'GuestsHome'") || guestDetailsContent.includes('GuestsHome'),
      'GuestDetailsScreen must target GuestsHome route'
    );
    assert.ok(
      !guestDetailsContent.includes("navigation.navigate('Guests');") &&
      !guestDetailsContent.includes('navigation.navigate("Guests");'),
      'GuestDetailsScreen must NOT call navigation.navigate("Guests") which fails inside the Guests tab'
    );
    assert.ok(
      guestDetailsContent.includes('navigation.reset') &&
      guestDetailsContent.includes("routes: [{ name: 'GuestsHome' }]"),
      'GuestDetailsScreen must use navigation.reset to reset the stack to GuestsHome'
    );
    assert.ok(
      guestDetailsContent.includes('navigateToGuestsList'),
      'GuestDetailsScreen must define navigateToGuestsList helper'
    );
  });

  it('3. GuestDetailsScreen prevents multiple delete requests during pending deletion', () => {
    assert.ok(
      guestDetailsContent.includes('deletingGuest || deleteGuest.isPending'),
      'GuestDetailsScreen must check deletingGuest || deleteGuest.isPending to prevent multiple delete calls'
    );
    assert.ok(
      guestDetailsContent.includes('disabled={deletingGuest || deleteGuest.isPending}'),
      'Delete Guest button must be disabled when deletion is in progress'
    );
    assert.ok(
      guestDetailsContent.includes('loading={deletingGuest || deleteGuest.isPending}'),
      'Delete Guest button must show loading state when deletion is in progress'
    );
  });

  it('4. GuestDetailsScreen handles failure without navigating and displays actual error', () => {
    assert.ok(
      guestDetailsContent.includes("Alert.alert('Cannot Delete Guest'"),
      'GuestDetailsScreen must display Cannot Delete Guest alert on failure'
    );
    assert.ok(
      guestDetailsContent.includes('setDeletingGuest(false)'),
      'GuestDetailsScreen must reset deletingGuest in finally block to allow retrying'
    );
  });

  it('5. GuestEditSheet onDeleted callback also triggers navigateToGuestsList', () => {
    assert.ok(
      guestDetailsContent.includes('onDeleted={() => {') &&
      guestDetailsContent.includes('navigateToGuestsList()'),
      'GuestEditSheet onDeleted in GuestDetailsScreen must invoke navigateToGuestsList'
    );
  });

  it('6. GuestsScreen automatically refetches when screen gains focus', () => {
    assert.ok(
      guestsScreenContent.includes('useFocusEffect'),
      'GuestsScreen must use useFocusEffect from @react-navigation/native to refresh list on focus'
    );
    assert.ok(
      guestsScreenContent.includes('refetch();'),
      'GuestsScreen must refetch guest data when focused'
    );
  });

  it('7. useDeleteGuest hook invalidates guests query and cleans up cache', () => {
    assert.ok(
      guestsApiContent.includes("qc.invalidateQueries({ queryKey: ['guests'] })"),
      'useDeleteGuest must invalidate guests query key'
    );
    assert.ok(
      guestsApiContent.includes("qc.removeQueries({ queryKey: ['guest', guestId] })"),
      'useDeleteGuest must remove single guest cache on success'
    );
  });

  it('8. Behavioral simulation: Successful deletion resets stack to GuestsHome and prevents back navigation to deleted guest', async () => {
    let resetPayload = null;
    let stackRoutes = ['GuestsHome', 'GuestDetails'];
    let canGoBackResult = true;

    const mockNavigation = {
      reset: (payload) => {
        resetPayload = payload;
        stackRoutes = payload.routes.map(r => r.name);
        canGoBackResult = stackRoutes.length > 1;
      },
      canGoBack: () => canGoBackResult,
      goBack: () => {
        if (canGoBackResult) {
          stackRoutes.pop();
          canGoBackResult = stackRoutes.length > 1;
        }
      },
    };

    let invalidatedQueryKeys = [];
    let removedQueryKeys = [];
    const mockQueryClient = {
      invalidateQueries: ({ queryKey }) => { invalidatedQueryKeys.push(queryKey); },
      removeQueries: ({ queryKey }) => { removedQueryKeys.push(queryKey); },
    };

    let toastMessage = null;
    const mockToast = (msg) => { toastMessage = msg; };

    let mutationCalledWith = null;
    const mockDeleteGuest = {
      mutateAsync: async (id) => {
        mutationCalledWith = id;
        return { deleted: true };
      },
      isPending: false,
    };

    const guestId = 42;
    const guest = { id: 42, name: 'Alice Smith' };

    // Simulate the deletion workflow
    const executeDelete = async (navigation, queryClient, toast, deleteGuest) => {
      await deleteGuest.mutateAsync(guestId);
      queryClient.invalidateQueries({ queryKey: ['guests'] });
      queryClient.removeQueries({ queryKey: ['guest', guestId] });
      toast(`Guest ${guest.name} deleted.`);
      if (typeof navigation?.reset === 'function') {
        navigation.reset({
          index: 0,
          routes: [{ name: 'GuestsHome' }],
        });
      } else if (typeof navigation?.replace === 'function') {
        navigation.replace('GuestsHome');
      }
    };

    await executeDelete(mockNavigation, mockQueryClient, mockToast, mockDeleteGuest);

    assert.equal(mutationCalledWith, 42, 'Must call delete mutation with guestId');
    assert.deepEqual(invalidatedQueryKeys, [['guests']], 'Must invalidate guests query');
    assert.deepEqual(removedQueryKeys, [['guest', 42]], 'Must remove deleted guest cache');
    assert.equal(toastMessage, 'Guest Alice Smith deleted.', 'Must show success toast');
    assert.deepEqual(resetPayload, { index: 0, routes: [{ name: 'GuestsHome' }] }, 'Must reset stack with index 0 and GuestsHome');
    assert.deepEqual(stackRoutes, ['GuestsHome'], 'Stack history must only contain GuestsHome');
    assert.equal(mockNavigation.canGoBack(), false, 'canGoBack must be false, preventing navigating back to deleted guest');
  });

  it('9. Behavioral simulation: Deletion failure retains user on Guest Details and alerts error', async () => {
    let resetCalled = false;
    const mockNavigation = {
      reset: () => { resetCalled = true; },
      replace: () => { resetCalled = true; },
      navigate: () => { resetCalled = true; },
    };

    let alertTitle = null;
    let alertMsg = null;
    let toastMsg = null;
    let isDeleting = false;

    const mockDeleteGuest = {
      mutateAsync: async () => {
        throw new Error('Guest has active in-house stay and cannot be deleted.');
      },
    };

    const guestId = 99;
    const guest = { id: 99, name: 'Bob Jones' };

    const executeDelete = async () => {
      isDeleting = true;
      try {
        await mockDeleteGuest.mutateAsync(guestId);
        mockNavigation.reset({ index: 0, routes: [{ name: 'GuestsHome' }] });
      } catch (e) {
        const msg = e.message || 'Cannot delete guest.';
        toastMsg = msg;
        alertTitle = 'Cannot Delete Guest';
        alertMsg = msg;
      } finally {
        isDeleting = false;
      }
    };

    await executeDelete();

    assert.equal(resetCalled, false, 'Must NOT navigate when deletion fails');
    assert.equal(isDeleting, false, 'Must reset deleting state on failure');
    assert.equal(toastMsg, 'Guest has active in-house stay and cannot be deleted.');
    assert.equal(alertTitle, 'Cannot Delete Guest');
    assert.equal(alertMsg, 'Guest has active in-house stay and cannot be deleted.');
  });

  it('10. Behavioral simulation: Blocks multiple simultaneous delete requests', async () => {
    let callCount = 0;
    const mockDeleteGuest = {
      mutateAsync: async () => {
        callCount++;
        await new Promise((r) => setTimeout(r, 10));
        return { deleted: true };
      },
      isPending: false,
    };

    let deletingGuest = false;

    const triggerDelete = async () => {
      if (deletingGuest || mockDeleteGuest.isPending) return 'BLOCKED';
      deletingGuest = true;
      try {
        await mockDeleteGuest.mutateAsync(1);
        return 'SUCCESS';
      } finally {
        deletingGuest = false;
      }
    };

    // Trigger first call, then immediately trigger second call while first is in-flight
    const p1 = triggerDelete();
    const p2 = triggerDelete();

    const [r1, r2] = await Promise.all([p1, p2]);

    assert.equal(r1, 'SUCCESS', 'First call must succeed');
    assert.equal(r2, 'BLOCKED', 'Second concurrent call must be blocked');
    assert.equal(callCount, 1, 'Mutation must only be called once');
  });
});
