import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useGuests } from '../api/guests';
import { Input } from './ui/Field';
import { colors, fonts, radii } from '../theme/theme';

/** RN reimplementation of the web's searchable guest-reference combobox. */
export default function ReferredBySelect({ value, onChange, initialGuest = null, excludeGuestId = null, hasError = false }) {
  const { data: guests, isLoading } = useGuests('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const selectedGuest =
    (guests && guests.find((g) => g.id === Number(value))) ||
    (initialGuest && initialGuest.id === Number(value) ? initialGuest : null);

  const filtered = (guests || []).filter((g) => {
    if (excludeGuestId && g.id === Number(excludeGuestId)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (g.name || '').toLowerCase().includes(q) || (g.phone || '').includes(q);
  });

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Input
          style={{ flex: 1 }}
          error={hasError}
          placeholder="Search guest by name or phone…"
          value={open ? search : selectedGuest ? `${selectedGuest.name} (${selectedGuest.phone})` : ''}
          onFocus={() => {
            setOpen(true);
            setSearch('');
          }}
          onChangeText={setSearch}
        />
        {selectedGuest ? (
          <Pressable
            onPress={() => {
              onChange(null, null);
              setSearch('');
              setOpen(false);
            }}
            hitSlop={8}
          >
            <Text style={{ fontSize: 18, color: colors.textSecondary }}>×</Text>
          </Pressable>
        ) : null}
      </View>

      {open ? (
        <View style={styles.dropdown}>
          {isLoading ? (
            <Text style={styles.msg}>Loading guests…</Text>
          ) : filtered.length === 0 ? (
            <Text style={styles.msg}>{search.trim() ? 'No matching guests found' : 'No guests available'}</Text>
          ) : (
            <FlatList
              data={filtered.slice(0, 20)}
              keyExtractor={(g) => String(g.id)}
              style={{ maxHeight: 220 }}
              renderItem={({ item: g }) => (
                <Pressable
                  style={styles.row}
                  onPress={() => {
                    onChange(g.id, g);
                    setSearch('');
                    setOpen(false);
                  }}
                >
                  <Text style={styles.name}>{g.name}</Text>
                  <Text style={styles.phone}>{g.phone}</Text>
                </Pressable>
              )}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dropdown: {
    marginTop: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  msg: { padding: 12, fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  name: { fontFamily: fonts.bodySemibold, fontSize: 13.5, color: colors.heading },
  phone: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.textSecondary },
});
