// Overlay/BottomSheet, Feedback/Dialog and Feedback/Toast from the design system.

import { ChevronRight, Trash2, X, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, radius, spacing, type } from '../theme/tokens';
import { IconButton } from './Buttons';

const SCRIM = 'rgba(16, 23, 19, 0.6)';

// ----- Overlay/BottomSheet -----

interface BottomSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function BottomSheet({ visible, title, onClose, children }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} accessibilityLabel="Close" onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing[16] }]}>
        <View style={styles.handle} />
        <View style={styles.sheetHeader}>
          <Text accessibilityRole="header" style={[type.headingMedium, styles.primary]}>{title}</Text>
          <IconButton icon={X} accessibilityLabel="Close" onPress={onClose} />
        </View>
        {children}
      </View>
    </Modal>
  );
}

interface SheetActionProps {
  icon: LucideIcon;
  /** Icon tint: brand for income/budget, ink for expense, info for goals. */
  tint?: string;
  tileBackground?: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}

/** Row in the quick-add sheet: 40px tile, title + subtitle, chevron. */
export function SheetAction({ icon: Icon, tint = color.content.primary, tileBackground = color.surface.variant, title, subtitle, onPress }: SheetActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && { backgroundColor: color.surface.variant }]}
    >
      <View style={[styles.tile, { backgroundColor: tileBackground }]}>
        <Icon size={20} strokeWidth={2} color={tint} />
      </View>
      <View style={styles.actionText}>
        <Text style={[type.bodyLarge, styles.primary]}>{title}</Text>
        <Text style={[type.bodySmall, styles.secondary]}>{subtitle}</Text>
      </View>
      <ChevronRight size={20} color={color.content.secondary} />
    </Pressable>
  );
}

// ----- Feedback/Dialog -----

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Destructive confirmation: cancel on the left, red confirm on the right. */
export function ConfirmDialog({ visible, title, message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.dialogScrim}>
        <View accessibilityViewIsModal style={styles.dialog}>
          <View style={styles.dialogIcon}>
            <Trash2 size={20} strokeWidth={2} color={color.feedback.error} />
          </View>
          <View style={styles.dialogText}>
            <Text accessibilityRole="header" style={[type.headingMedium, styles.primary]}>{title}</Text>
            <Text style={[type.bodyMedium, styles.secondary]}>{message}</Text>
          </View>
          <View style={styles.dialogButtons}>
            <Pressable accessibilityRole="button" onPress={onCancel} style={[styles.dialogButton, styles.cancel]}>
              <Text style={[type.button, styles.primary]}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onConfirm} style={[styles.dialogButton, styles.destructive]}>
              <Text style={[type.button, { color: color.content.onBrand }]}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ----- Feedback/Toast -----

interface ToastProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Ink bar anchored above the bottom navigation. */
export function Toast({ message, actionLabel, onAction }: ToastProps) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.toast}>
      <Trash2 size={20} strokeWidth={2} color={color.content.onBrand} />
      <Text style={[type.bodyMedium, styles.toastText]}>{message}</Text>
      {actionLabel && (
        <Pressable accessibilityRole="button" hitSlop={12} onPress={onAction}>
          <Text style={[type.button, { color: color.content.onBrand }]}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  primary: { color: color.content.primary },
  secondary: { color: color.content.secondary },
  scrim: { flex: 1, backgroundColor: SCRIM },
  sheet: {
    paddingTop: spacing[8],
    paddingHorizontal: spacing[24],
    backgroundColor: color.surface.default,
    borderTopLeftRadius: radius.lg + 8,
    borderTopRightRadius: radius.lg + 8,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: color.border.default,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: spacing[8] },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    minHeight: 56,
    paddingVertical: spacing[8],
    borderRadius: radius.sm,
  },
  tile: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  actionText: { flex: 1 },
  dialogScrim: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: SCRIM },
  dialog: {
    width: 320,
    maxWidth: '90%',
    gap: spacing[16],
    padding: spacing[20],
    borderRadius: radius.lg + 8,
    backgroundColor: color.surface.default,
    boxShadow: '0px 12px 32px rgba(15, 23, 18, 0.12)',
  },
  dialogIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.feedback.errorSubtle,
  },
  dialogText: { gap: spacing[8] },
  dialogButtons: { flexDirection: 'row', gap: spacing[8] },
  dialogButton: { flex: 1, height: 48, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  cancel: { backgroundColor: color.surface.variant },
  destructive: { backgroundColor: color.feedback.error },
  toast: {
    position: 'absolute',
    left: spacing[24],
    right: spacing[24],
    bottom: spacing[16],
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    paddingHorizontal: spacing[16],
    borderRadius: radius.sm,
    backgroundColor: color.content.primary,
    boxShadow: '0px 4px 12px rgba(15, 23, 18, 0.08)',
  },
  toastText: { flex: 1, color: color.content.onBrand },
});
