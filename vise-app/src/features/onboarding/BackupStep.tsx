import { useState } from 'react';
import { Text } from 'react-native';

import { Alert } from '../../components/Alert';
import { PrimaryButton } from '../../components/Buttons';
import { WarningDialog } from '../../components/Overlays';
import { backUpToFolder } from '../../data/backupFiles';
import { folderLabel } from '../../data/backupNames';
import { passphraseProblem } from '../../data/passphrase';
import { PassphraseFields } from '../backup/PassphraseFields';
import { color, type } from '../../theme/tokens';
import { Heading, OnboardingScreen, type StepperProps } from './OnboardingScreen';

interface Props {
  stepper: StepperProps;
  /** Leaves this step, whether the user backed up or chose to skip. */
  onDone: () => void;
}

/**
 * The last step, after everything is saved: choose a folder and make the first backup. Skipping is allowed, but
 * only after a plain warning about what it means, because a lost phone with no backup cannot be undone.
 */
export function BackupStep({ stepper, onDone }: Props) {
  const [protect, setProtect] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState(false);

  const problem = protect ? passphraseProblem(passphrase, confirmation) : null;

  async function backUp() {
    setTried(true);
    setError(null);
    if (problem) return;
    setBusy(true);
    try {
      const result = await backUpToFolder({ folder: null, passphrase: protect ? passphrase : undefined });
      if (result) onDone();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The backup could not be saved. Try again, or skip for now.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingScreen
      stepper={{ ...stepper, onSkip: () => setWarning(true) }}
      actions={<PrimaryButton label="Choose a folder and back up" loading={busy} onPress={backUp} />}
    >
      <Heading
        title="Never lose your data"
        description="Save a backup in a folder on this phone. It stays there even if you delete VISE, and you can bring it back from the first screen."
      />
      <Text style={[{ color: color.content.secondary }, type.bodyMedium]}>
        Nothing is uploaded. You choose where the file is kept, and you can add Google Drive later.
      </Text>
      {error && <Alert type="error" title="Couldn’t back up" description={error} />}
      <PassphraseFields
        enabled={protect}
        onEnabled={setProtect}
        passphrase={passphrase}
        onPassphrase={setPassphrase}
        confirmation={confirmation}
        onConfirmation={setConfirmation}
        error={tried ? (problem ?? undefined) : undefined}
      />

      <WarningDialog
        visible={warning}
        title="Skip the backup?"
        message="Without a backup your data exists only on this phone. If you delete VISE, or lose or reset the phone, it can’t be recovered. You can turn this on later in Settings → Backup & restore."
        primaryLabel="Back up now"
        onPrimary={() => setWarning(false)}
        secondaryLabel="Skip anyway"
        onSecondary={() => {
          setWarning(false);
          onDone();
        }}
      />
    </OnboardingScreen>
  );
}

export { folderLabel };
