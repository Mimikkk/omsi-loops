import { t } from '../../../../locales/translations.utils.ts';
import { getSaveName, performClearSave, performGameLoad, performSaveGame } from '../../../../original/saving.ts';
import { Button } from '../../../../components/buttons/Button/Button.tsx';
import { createMemo, createSignal } from 'solid-js';
import { actions } from '../../../../original/actions.ts';
import { view } from '../../../../views/main.view.ts';
import { vals } from '../../../../original/saving.ts';
import { performGamePause } from '../../../../original/driver.ts';
import { Card } from '../../../../components/containers/Card/Card.tsx';
import { getActionPrototype } from '../../../../original/actionList.ts';
import { readFileContents } from '../../../../utils/readFileContents.ts';
import { saveTextFile } from '../../../../utils/saveTextFile.tsx';
import { createRef, Reference } from '../../../../signals/createRef.ts';
import { maybe } from '../../../../utils/maybe.tsx';
import { PopoverOriginal } from '../../../../components/containers/Popover/PopoverOriginal.tsx';
import { Popover } from '../../../../components/containers/Popover/Popover.tsx';
import { Tooltip } from '../../../../components/containers/Popover/Tooltip.tsx';
import { Base64 } from '../../../../utils/Base64.ts';

const loadSaveState = (saveStr: string) => {
  if (!confirm(t('menu.save.messages.loadWarning'))) return;
  const save = Base64.decode(saveStr);

  globalThis.localStorage[getSaveName()] = save;

  performClearSave();
  performGameLoad(null, save);
  performGamePause();
};

const parseActionListToStr = (actions: any): string => actions.map(({ name, loops }) => `${loops}x ${name}`).join('\n');

const parseActionListFromStr = (str: string): { action: any; name: string; loops: number }[] | undefined => {
  const actions = [];
  for (const line of str.split('\n').filter((s) => s.trim() !== '')) {
    const [loops, name] = line.split('x');
    const action = getActionPrototype(name);
    if (!action) return undefined;

    actions.push({ action, name, loops: +loops });
  }

  return actions;
};

const manageActionList = (inputRef: Reference<HTMLTextAreaElement>) => {
  const [actionlistStr, setActionlistStr] = createSignal<string>('');
  const isActionListValid = createMemo(() => !!parseActionListFromStr(actionlistStr()));

  const exportActionList = () => {
    setActionlistStr(parseActionListToStr(actions.next));

    inputRef.active.select();
    navigator.clipboard.writeText(actionlistStr());
  };

  const importActionList = () => {
    const records = parseActionListFromStr(actionlistStr());
    if (!records) return;

    actions.fromRecords(records);
    view.updateNextActions();
  };

  return {
    actionlistStr,
    setActionlistStr,
    isActionListValid,
    exportActionList,
    importActionList,
  };
};

const manageSaveText = (inputRef: Reference<HTMLInputElement>) => {
  const [saveStr, setSaveStr] = createSignal<string>('');

  const isSaveStrValid = createMemo(() => maybe(() => typeof Base64.decode(saveStr()) === 'object', false));

  const selectSaveText = () => inputRef.active.select();
  const exportSaveText = () => {
    setSaveStr(Base64.encode(performSaveGame()));

    selectSaveText();
    navigator.clipboard.writeText(saveStr());
  };

  const importSaveText = () => loadSaveState(saveStr());

  return {
    saveStr,
    setSaveStr,
    isSaveStrValid,
    selectSaveText,
    exportSaveText,
    importSaveText,
  };
};

const manageSaveFile = (inputRef: Reference<HTMLInputElement>) => {
  const selectSaveFile = () => inputRef.active.click();

  const importSaveFile = async (event: Event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    loadSaveState(await readFileContents(file));
  };

  const exportSaveFile = () => {
    const name = t('game.title');
    const version = t('menu.changelog.versions.0.name');

    const savename = `${name} ${version} - Loop ${vals.totals.loops}`;

    return saveTextFile(Base64.encode(performSaveGame()), savename);
  };

  return {
    selectSaveFile,
    importSaveFile,
    exportSaveFile,
  };
};

const ManageSaveFileSection = () => {
  const manageFileRef = createRef<HTMLInputElement>();
  const { selectSaveFile, importSaveFile, exportSaveFile } = manageSaveFile(manageFileRef);

  return (
    <section class='flex flex-col gap-2'>
      <span class='font-bold'>{t('menu.save.titles.saveToFile')}</span>
      <span>{t('menu.save.messages.manageSaveFile')}</span>
      <div class='grid grid-cols-2 gap-2'>
        <Button onClick={exportSaveFile}>{t('menu.save.actions.export')}</Button>
        <Button onClick={selectSaveFile}>{t('menu.save.actions.import')}</Button>
      </div>
      <input ref={manageFileRef} class='hidden' type='file' onChange={importSaveFile} />
    </section>
  );
};

const ManageSaveTextSection = () => {
  const manageTextRef = createRef<HTMLInputElement>();
  const { saveStr, setSaveStr, isSaveStrValid, exportSaveText, importSaveText } = manageSaveText(manageTextRef);

  return (
    <section class='flex flex-col gap-2'>
      <span class='font-bold'>{t('menu.save.titles.saveToText')}</span>
      <span>{t('menu.save.messages.manageSaveText')}</span>
      <input
        ref={manageTextRef}
        class='
              px-2
              border border-neutral-500 hover:border-neutral-700
              rounded-sm
              transition-colors duration-100
            '
        value={saveStr()}
        oninput={(e) => setSaveStr(e.target.value)}
      >
      </input>
      <div class='grid grid-cols-2 gap-2'>
        <Button onClick={exportSaveText}>{t('menu.save.actions.export')}</Button>
        <Button disabled={!isSaveStrValid()} onClick={importSaveText}>{t('menu.save.actions.import')}</Button>
      </div>
    </section>
  );
};

const ManageActionlistSection = () => {
  const manageActionlistRef = createRef<HTMLTextAreaElement>();
  const { actionlistStr, setActionlistStr, isActionListValid, exportActionList, importActionList } = manageActionList(
    manageActionlistRef,
  );

  return (
    <section class='flex flex-col gap-2'>
      <span class='font-bold'>{t('menu.save.titles.actionlist')}</span>
      <span>{t('menu.save.messages.manageActionlist')}</span>
      <textarea
        ref={manageActionlistRef}
        class='
              w-full min-h-20 max-h-80
              px-2
              border border-neutral-500 hover:border-neutral-700
              rounded-sm
              transition-colors duration-100
            '
        value={actionlistStr()}
        oninput={(e) => setActionlistStr(e.target.value)}
      />
      <div class='grid grid-cols-2 gap-2'>
        <Button onClick={exportActionList}>{t('menu.save.actions.export')}</Button>
        <Button disabled={!isActionListValid()} onClick={importActionList}>{t('menu.save.actions.import')}</Button>
      </div>
    </section>
  );
};

export const SaveMenu = () => (
  <>
    <PopoverOriginal title={t('menu.save.title')}>
      <Card class='flex flex-col gap-2'>
        <Button onClick={() => performSaveGame()}>{t('menu.save.actions.saveGame')}</Button>
        <hr class='border-neutral-500'></hr>
        <ManageActionlistSection />
        <hr class='border-neutral-500'></hr>
        <ManageSaveTextSection />
        <hr class='border-neutral-500'></hr>
        <ManageSaveFileSection />
      </Card>
    </PopoverOriginal>
    <Tooltip id='tooltip-1'>
      <Popover.Target>
        <span>{t('menu.save.title')}</span>
      </Popover.Target>
      <Popover.Content>
        <span class='bg-slate-500'>HellADADo</span>
      </Popover.Content>
    </Tooltip>
  </>
);
