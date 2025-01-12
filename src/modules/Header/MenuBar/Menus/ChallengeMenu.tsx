import { ChallengeMode } from '../../../../original/challenges.ts';
import { Button } from '../../../../components/buttons/Button/Button.tsx';
import { challengeSaveName, getSaveName, load, save, setSaveName, vals } from '../../../../original/saving.ts';
import { t } from '../../../../locales/translations.utils.ts';
import { pauseGame, restart } from '../../../../original/driver.ts';

function beginChallenge(challenge: ChallengeMode) {
  console.log('Beginning Challenge');

  if (globalThis.localStorage[challengeSaveName] && globalThis.localStorage[challengeSaveName] !== '') {
    if (confirm('Beginning a new challenge will delete your current challenge save. Are you sure you want to begin?')) {
      globalThis.localStorage[challengeSaveName] = '';
    } else {
      return;
    }
  }

  if (vals.challengeSave.challengeMode === 0) {
    vals.challengeSave.inChallenge = true;
    save();
    console.log('Saving to: ' + getSaveName());
  }

  vals.challengeSave.challengeMode = challenge;
  setSaveName(challengeSaveName);

  load(true);
  vals.totalOfflineMs = 1000000;

  save();
  pauseGame();
  restart();
}

function exitChallenge() {
  if (vals.challengeSave.challengeMode !== 0) {
    setSaveName(vals.defaultSaveName);
    load(false);
    save();
    location.reload();
  }
}

function resumeChallenge() {
  if (
    vals.challengeSave.challengeMode === 0 && globalThis.localStorage[challengeSaveName] &&
    globalThis.localStorage[challengeSaveName] !== ''
  ) {
    vals.challengeSave.inChallenge = true;
    save();
    setSaveName(challengeSaveName);
    load(true);
    save();
    pauseGame();
    restart();
  }
}

export const ChallengeMenu = () => {
  return (
    <li class='contains-popover'>
      {t('menu.challenges.title')}
      <div class='popover-content'>
        <div>{t('menu.challenges.messages.description')}</div>
        <div>{t('menu.challenges.messages.recommendation')}</div>
        <div>{t('menu.challenges.messages.saveBeforeStarting')}</div>
        <div class='font-bold'>{t('menu.challenges.messages.warnBeginChallenge')}</div>
        <div class='font-bold'>Current challenge: {vals.challengeSave.challengeMode}</div>
        <div class='flex flex-col gap-4'>
          <div class='flex flex-col gap-2'>
            <Button class='showthat' onClick={() => beginChallenge(ChallengeMode.ManaDrought)}>
              {t('menu.challenges.challenges.manaDrought.title')}
              <div class='showthis'>
                {t('menu.challenges.challenges.manaDrought.description')}
              </div>
            </Button>
            <Button class='showthat' onClick={() => beginChallenge(ChallengeMode.NoodleArms)}>
              {t('menu.challenges.challenges.noodleArms.title')}
              <div class='showthis'>
                {t('menu.challenges.challenges.noodleArms.description')}
              </div>
            </Button>
            <Button class='showthat' onClick={() => beginChallenge(ChallengeMode.ManaBurn)}>
              {t('menu.challenges.challenges.manaBurn.title')}
              <div class='showthis'>
                {t('menu.challenges.challenges.manaBurn.description')}
              </div>
            </Button>
          </div>
          <div class='flex gap-2'>
            <Button class='w-full' onClick={() => exitChallenge()}>
              {t('menu.challenges.challenges.exit')}
            </Button>
            <Button class='w-full' onClick={() => resumeChallenge()}>
              {t('menu.challenges.challenges.resume')}
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
};
