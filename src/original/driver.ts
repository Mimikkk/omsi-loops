import { view } from '../views/main.view.ts';
import { getBuffLevel, getRitualBonus, getSkillBonus, getSkillLevel, restartStats } from './stats.ts';
import {
  adjustAllRocks,
  adjustArtifacts,
  adjustDonations,
  adjustGeysers,
  adjustHerbs,
  adjustHunt,
  adjustInsurance,
  adjustLocks,
  adjustLQuests,
  adjustMineSoulstones,
  adjustPockets,
  adjustPots,
  adjustPylons,
  adjustSQuests,
  adjustSuckers,
  adjustTrainingExpMult,
  adjustWarehouses,
  adjustWells,
  adjustWildMana,
  getActionPrototype,
  getExploreProgress,
  hasLimit,
  isTraining,
  trainingActions,
} from './actionList.ts';
import {
  clearPauseNotification,
  needsDataSnapshots,
  performSaveGame,
  setOption,
  showPauseNotification,
  vals,
} from './saving.ts';
import { Data } from './data.ts';
import { KeyboardKey } from '../modules/hotkeys/KeyboardKey.ts';
import { beep, clamp, copyArray, Mana } from './helpers.ts';
import { actions, actionStory, getNumOnList, markActionsComplete } from './actions.ts';
import { resources, resourcesTemplate, towns } from './globals.ts';
import { prestigeBonus, prestigeValues } from './prestige.ts';

let curTime = Date.now();
// actually milliseconds, not ticks
let gameTicksLeft = 0;
let lastSave = Date.now();

export function getSpeedMult(zone = vals.curTown) {
  let speedMult = 1;

  // Dark Ritual
  if (zone === 0) speedMult *= getRitualBonus(0, 20, 10);
  else if (zone === 1) speedMult *= getRitualBonus(20, 40, 5);
  else if (zone === 2) speedMult *= getRitualBonus(40, 60, 2.5);
  else if (zone === 3) speedMult *= getRitualBonus(60, 80, 1.5);
  else if (zone === 4) speedMult *= getRitualBonus(80, 100, 1);
  else if (zone === 5) speedMult *= getRitualBonus(100, 150, .5);
  else if (zone === 6) speedMult *= getRitualBonus(150, 200, .5);
  else if (zone === 7) speedMult *= getRitualBonus(200, 250, .5);
  else if (zone === 8) speedMult *= getRitualBonus(250, 300, .5);
  speedMult *= getRitualBonus(300, 666, .1);

  // Chronomancy
  speedMult *= getSkillBonus('Chronomancy');

  // Imbue Soul
  speedMult *= 1 + 0.5 * getBuffLevel('Imbuement3');

  // Prestige Chronomancy
  speedMult *= prestigeBonus('PrestigeChronomancy');

  return speedMult;
}

export function getActualGameSpeed() {
  return driverVals.gameSpeed * getSpeedMult() * bonusSpeed;
}

export function refreshDungeons(manaSpent) {
  for (const dungeon of vals.dungeons) {
    for (const level of dungeon) {
      const chance = level.ssChance;
      if (chance < 1) level.ssChance = Math.min(chance + 0.0000001 * manaSpent, 1);
    }
  }
}

export function singleTick() {
  vals.timer++;
  driverVals.timeCounter += 1 / driverVals.baseManaPerSecond;
  driverVals.effectiveTime += 1 / driverVals.baseManaPerSecond;

  actions.tick();

  refreshDungeons(1);

  if (vals.shouldRestart || vals.timer >= vals.timeNeeded) {
    loopEnd();
    prepareRestart();
  }
  gameTicksLeft -= 1000 / driverVals.baseManaPerSecond;
}

let lastAnimationTime = 0;
let animationFrameRequest = 0;
let animationTicksEnabled = true;

export function animationTick(animationTime) {
  if (animationTime == lastAnimationTime || !animationTicksEnabled) {
    // double tick in the same frame, drop this one
    return;
  }
  try {
    tick();
  } finally {
    animationFrameRequest = requestAnimationFrame(animationTick);
  }
}

export function tick() {
  const newTime = Date.now();
  gameTicksLeft += newTime - curTime;
  const delta = newTime - curTime;
  curTime = newTime;

  // save even when paused
  if (curTime - lastSave > vals.options.autosaveRate * 1000) {
    lastSave = curTime;
    performSaveGame();
  }

  // don't do any updates until we've got enough time built up to match the refresh rate setting
  if (gameTicksLeft < 1000 / windowFps) {
    return;
  }

  if (gameIsStopped) {
    addOffline(gameTicksLeft);
    updateLag(0);
    view.update();
    gameTicksLeft = 0;
    return;
  }

  const deadline = performance.now() + 1000 / windowFps; // don't go past the current frame update time

  executeGameTicks(deadline);
}

export function executeGameTicks(deadline) {
  // convert "gameTicksLeft" (actually milliseconds) into equivalent base-mana count, aka actual game ticks
  // including the gameSpeed multiplier here because it is effectively constant over the course of a single
  // update, and it affects how many actual game ticks pass in a given span of realtime.
  let baseManaToBurn = Mana.floor(
    gameTicksLeft * driverVals.baseManaPerSecond * driverVals.gameSpeed / 1000,
  );
  const originalManaToBurn = baseManaToBurn;
  let cleanExit = false;

  while (
    baseManaToBurn * bonusSpeed >= (vals.options.fractionalMana ? 0.01 : 1) &&
    performance.now() < deadline
  ) {
    if (gameIsStopped) {
      cleanExit = true;
      break;
    }
    // first, figure out how much *actual* mana is available to get spent. bonusSpeed gets rolled in first,
    // since it can change over the course of an update (if offline time runs out)
    let manaAvailable = baseManaToBurn;
    // totalMultiplier lets us back-convert from manaAvailable (in units of "effective game ticks") to
    // baseManaToBurn (in units of "realtime ticks modulated by gameSpeed") once we figure out how much
    // of our mana we're using in this cycle
    let totalMultiplier = 1;

    manaAvailable *= bonusSpeed;
    totalMultiplier *= bonusSpeed;

    if (bonusSpeed > 1) {
      // can't spend more mana than offline time available
      manaAvailable = Math.min(
        manaAvailable,
        Mana.ceil(
          vals.totalOfflineMs * driverVals.baseManaPerSecond * driverVals.gameSpeed *
            bonusSpeed / 1000,
        ),
      );
    }

    // next, roll in the multiplier from skills/etc
    let speedMult = getSpeedMult();
    manaAvailable *= speedMult;
    totalMultiplier *= speedMult;

    // limit to only how much time we have available
    manaAvailable = Math.min(manaAvailable, vals.timeNeeded - vals.timer);

    // don't run more than 1 tick
    if (vals.shouldRestart) {
      manaAvailable = Math.min(manaAvailable, 1);
    }

    // a single action may not use a partial tick, so ceil() to be sure unless fractionalMana.
    // Even with fractionalMana, we need to set a minimum so that mana usages aren't lost to floating-point precision.
    const manaSpent = Mana.ceil(
      actions.tick(manaAvailable),
      vals.timer / 1e15,
    );

    // okay, so the current action has used manaSpent effective ticks. figure out how much of our realtime
    // that accounts for, in base ticks and in seconds.
    const baseManaSpent = manaSpent / totalMultiplier;
    const timeSpent = baseManaSpent / driverVals.gameSpeed / driverVals.baseManaPerSecond;

    // update timers
    vals.timer += manaSpent; // number of effective mana ticks
    driverVals.timeCounter += timeSpent; // realtime seconds
    driverVals.effectiveTime += timeSpent * driverVals.gameSpeed * bonusSpeed; // "seconds" modified only by gameSpeed and offline bonus
    baseManaToBurn -= baseManaSpent; // burn spent mana
    gameTicksLeft -= timeSpent * 1000;

    // spend bonus time for this segment
    if (bonusSpeed !== 1) {
      addOffline(-timeSpent * (bonusSpeed - 1) * 1000);
    }

    refreshDungeons(manaSpent);

    if (vals.shouldRestart || vals.timer >= vals.timeNeeded) {
      cleanExit = true;
      loopEnd();
      prepareRestart();
      break; // don't span loops within tick()
    }
  }

  if (!gameIsStopped && baseManaToBurn * bonusSpeed >= 10) {
    if (!cleanExit || driverVals.lagSpeed > 0) {
      // lagging. refund all backlog as bonus time to clear the queue
      addOffline(gameTicksLeft);
      gameTicksLeft = 0;
    }
    updateLag((originalManaToBurn - baseManaToBurn) * bonusSpeed);
  } else if (baseManaToBurn * bonusSpeed < 1) {
    // lag cleared
    updateLag(0);
  }

  view.update();
}
let windowFps = 50;
let mainTickLoop;
export function recalcInterval(fps) {
  windowFps = fps;
  if (mainTickLoop !== undefined) {
    clearInterval(mainTickLoop);
  }
  if (globalThis.requestAnimationFrame) {
    animationFrameRequest = requestAnimationFrame(animationTick);
    mainTickLoop = setInterval(tick, 1000);
  } else {
    mainTickLoop = setInterval(tick, 1000 / fps);
  }
}

let gameIsStopped = false;
export function stopGame() {
  gameIsStopped = true;
  view.requestUpdate('updateTime', null);
  view.requestUpdate('updateCurrentActionBar', actions.currentPos);
  view.update();
  document.title = '*PAUSED* Idle Loops';

  if (needsDataSnapshots()) {
    Data.updateSnapshot('stop', 'base');
  }
}

export function performGamePause(ping?: boolean, message?: string) {
  gameIsStopped = !gameIsStopped;
  if (needsDataSnapshots()) {
    Data.discardToSnapshot('base', 1);
    Data.recordSnapshot('pause');
  }
  view.requestUpdate('updateTime', null);
  view.requestUpdate('updateCurrentActionBar', actions.currentPos);
  view.update();
  if (!gameIsStopped && vals.options.notifyOnPause) {
    clearPauseNotification();
  }
  document.title = gameIsStopped ? '*PAUSED* Idle Loops' : 'Idle Loops';
  if (
    !gameIsStopped && (vals.shouldRestart || vals.timer >= vals.timeNeeded)
  ) {
    performGameRestart();
  } else if (ping) {
    if (vals.options.pingOnPause) {
      beep(250);
      setTimeout(() => beep(250), 500);
    }
    if (vals.options.notifyOnPause) {
      showPauseNotification(message || 'Game paused!');
    }
  }
}

export function loopEnd() {
  if (driverVals.effectiveTime > 0) {
    vals.totals.time += driverVals.timeCounter;
    vals.totals.effectiveTime += driverVals.effectiveTime;
    vals.totals.loops++;
    const loopCompletedActions = actions.current.slice(0, actions.currentPos);
    if (
      actions.current[actions.currentPos] !== undefined &&
      actions.current[actions.currentPos].loopsLeft <
        actions.current[actions.currentPos].loops
    ) {
      loopCompletedActions.push(actions.current[actions.currentPos]);
    }
    markActionsComplete(loopCompletedActions);
    actionStory(loopCompletedActions);
    if (vals.options.highlightNew) {
      view.requestUpdate('removeAllHighlights', null);
      view.requestUpdate('highlightIncompleteActions', null);
    }
  }
}

export function prepareRestart() {
  const curAction = actions.getNextValidAction();
  if (
    vals.options.pauseBeforeRestart ||
    (vals.options.pauseOnFailedLoop &&
      (actions.current.filter((action) => action.loopsLeft - action.extraLoops > 0).length > 0))
  ) {
    if (vals.options.pingOnPause) {
      beep(250);
      setTimeout(() => beep(250), 500);
    }
    if (vals.options.notifyOnPause) {
      showPauseNotification('Game paused!');
    }
    if (curAction) {
      actions.completedTicks += actions.getNextValidAction().ticks;
      view.requestUpdate('updateTotalTicks', null);
    }
    for (let i = 0; i < actions.current.length; i++) {
      view.requestUpdate('updateCurrentActionBar', i);
    }
    stopGame();
  } else {
    performGameRestart();
  }
}

export function performGameRestart() {
  vals.shouldRestart = false;
  vals.timer = 0;
  driverVals.timeCounter = 0;
  driverVals.effectiveTime = 0;
  vals.timeNeeded = vals.timeNeededInitial;
  document.title = 'Idle Loops';
  vals.currentLoop = vals.totals.loops + 1; // don't let currentLoop get out of sync with totals.loops, that'd cause problems
  resetResources();
  restartStats();
  for (let i = 0; i < towns.length; i++) {
    towns[i].restart();
  }
  actions.restart();
  view.requestUpdate('updateTrials', null);
  if (needsDataSnapshots()) {
    Data.updateSnapshot('restart', 'base');
  }
}

export function manualRestart() {
  loopEnd();
  performGameRestart();
  view.update();
}

export function addActionToList(name, townNum, isTravelAction?: boolean, insertAtIndex?: number) {
  for (const action of towns[townNum].totalActionList) {
    if (action.name === name) {
      if (
        action.visible() && action.unlocked() &&
        (!action.allowed || getNumOnList(action.name) < action.allowed())
      ) {
        let addAmount = actions.addAmount;
        if (action.allowed) {
          const numMax = action.allowed();
          const numHave = getNumOnList(action.name);
          if (numMax - numHave < addAmount) {
            addAmount = numMax - numHave;
          }
        }
        if (isTravelAction) {
          const index = actions.addAction(name, 1, insertAtIndex);
          view.requestUpdate('highlightAction', index);
        } else {
          const index = actions.addAction(name, addAmount, insertAtIndex);
          view.requestUpdate('highlightAction', index);
          if (KeyboardKey.shift() && hasLimit(name)) {
            capAmount(index, townNum);
          } else if (KeyboardKey.shift() && isTraining(name)) {
            capTraining(index);
          }
        }
      }
    }
  }
}

// mana and resources

export function addMana(amount) {
  vals.timeNeeded += amount;
}

export function addResource(resource, amount) {
  if (Number.isFinite(amount)) resources[resource] += amount;
  else resources[resource] = amount;
}

export function resetResource(resource) {
  resources[resource] = resourcesTemplate[resource];
}

export function resetResources() {
  Object.assign(resources, resourcesTemplate);

  if (getExploreProgress() >= 100 || prestigeValues['completedAnyPrestige']) {
    addResource('glasses', true);
  }
}

export function selectLoadout(num) {
}

export function loadLoadout(num) {
}

let globalCustomInput = '';
export function saveList() {
  if (vals.curLoadout === 0) {
    performSaveGame();
    return;
  }
  nameList(false);
  vals.loadouts[vals.curLoadout] = copyArray(actions.next);
  performSaveGame();
  if ((document.getElementById('renameLoadout').value !== 'Saved!')) {
    globalCustomInput = document.getElementById('renameLoadout').value;
  }
  document.getElementById('renameLoadout').value = 'Saved!';
  setTimeout(() => {
    document.getElementById('renameLoadout').value = globalCustomInput;
  }, 1000);
}

export function nameList(saveGame) {
}

export function loadList() {
}

export function clearList() {
}

export function unlockTown(townNum) {
  if (!towns[townNum].unlocked()) {
    vals.townsUnlocked.push(townNum);
    vals.townsUnlocked.sort();
  }
  let cNum = vals.challengeSave.challengeMode;
  if (cNum !== 0) {
    if (vals.challengeSave['c' + cNum] < townNum) {
      vals.challengeSave['c' + cNum] = townNum;
    } else if (vals.challengeSave['c' + cNum] === undefined) {
      vals.challengeSave['c' + cNum] = townNum;
    }
  }
  vals.curTown = townNum;
}
export function adjustAll() {
  adjustPots();
  adjustLocks();
  adjustSQuests();
  adjustLQuests();
  adjustWildMana();
  adjustHerbs();
  adjustHunt();
  adjustSuckers();
  adjustGeysers();
  adjustMineSoulstones();
  adjustArtifacts();
  adjustDonations();
  adjustWells();
  adjustPylons();
  adjustPockets();
  adjustWarehouses();
  adjustInsurance();
  adjustAllRocks();
  adjustTrainingExpMult();
  view.requestUpdate('adjustManaCost', 'Continue On');
}
export function capAction(actionId) {
  const action = actions.findActionWithId(actionId);
  if (!action) return;
  if (hasLimit(action.name)) {
    return capAmount(action.index, getActionPrototype(action.name).townNum);
  } else if (isTraining(action.name)) {
    return capTraining(action.index);
  }
}
export function capAmount(index, townNum) {
  const action = actions.next[index];
  const varName = `good${getActionPrototype(action.name)?.varName}`;
  let alreadyExisting;
  alreadyExisting = getNumOnList(action.name) +
    (action.disabled ? action.loops : 0);
  let newLoops;
  if (action.name.startsWith('Survey')) newLoops = 500 - alreadyExisting;
  if (action.name === 'Gather Team') {
    newLoops = 5 + Math.floor(getSkillLevel('Leadership') / 100) - alreadyExisting;
  } else newLoops = towns[townNum][varName] - alreadyExisting;
  actions.updateAction(index, { loops: clamp(action.loops + newLoops, 0, null) });
}
export function capTraining(index) {
  const action = actions.next[index];
  const alreadyExisting = getNumOnList(action.name) + (action.disabled ? action.loops : 0);
  const newLoops = vals.trainingLimits - alreadyExisting;
  actions.updateAction(index, { loops: clamp(action.loops + newLoops, 0, null) });
}
export function capAllTraining() {
  for (const [index, action] of actions.next.entries()) {
    // @ts-ignore
    if (trainingActions.includes(action.name)) {
      capTraining(index);
    }
  }
}
export function addLoop(actionId) {
  const action = actions.findActionWithId(actionId);
  const theClass = getActionPrototype(action.name);
  let addAmount = actions.addAmount;
  if (theClass.allowed) {
    const numMax = theClass.allowed();
    const numHave = getNumOnList(theClass.name) + (action.disabled ? action.loops : 0);
    if ((numMax - numHave) < addAmount) {
      addAmount = numMax - numHave;
    }
  }
  actions.updateAction(action.index, {
    loops: clamp(action.loops + addAmount, 0, 1e12),
  });
}
export function removeLoop(actionId) {
  const action = actions.findActionWithId(actionId);
  actions.updateAction(action.index, {
    loops: clamp(action.loops - actions.addAmount, 0, 1e12),
  });
}
export function split(actionId) {
  const action = actions.findActionWithId(actionId);
  actions.splitAction(action.index);
}
export function collapse(actionId) {
  const action = actions.findActionWithId(actionId);
  actions.updateAction(action.index, { collapsed: !action.collapsed });
}
export function showNotification(name) {
  document.getElementById(`${name}Notification`).style.display = 'block';
}
export function hideNotification(name) {
  vals.unreadActionStories = vals.unreadActionStories.filter((toRead) => toRead !== name);
  document.getElementById(`${name}Notification`).style.display = 'none';
}

export function moveUp(actionId) {
  const index = actions.findIndexOfActionWithId(actionId);
  if (index <= 0) {
    return;
  }
  actions.moveAction(index, index - 1);
}
export function moveDown(actionId) {
  const index = actions.findIndexOfActionWithId(actionId);
  if (index >= actions.next.length - 1) {
    return;
  }
  actions.moveAction(index, index + 1);
}
export function disableAction(actionId) {
  const index = actions.findIndexOfActionWithId(actionId);
  const action = actions.next[index];
  const translated = getActionPrototype(action.name);
  if (action.disabled) {
    if (!translated.allowed || getNumOnList(action.name) + action.loops <= translated.allowed()) {
      actions.updateAction(index, { disabled: false });
    }
  } else {
    actions.updateAction(index, { disabled: true });
  }
}
export function removeAction(actionId) {
  const index = actions.findIndexOfActionWithId(actionId);
  actions.removeAction(index);
}

export function borrowTime() {
  addOffline(86400_000);
  vals.totals.borrowedTime += 86400;
}

export function returnTime() {
  if (vals.totalOfflineMs >= 86400_000) {
    addOffline(-86400_000);
    vals.totals.borrowedTime -= 86400;
  }
}

let lagStart = 0;
let lagSpent = 0;
export function updateLag(manaSpent) {
  if (manaSpent === 0) { // cancel lag display
    if (driverVals.lagSpeed !== 0) {
      driverVals.lagSpeed = 0;
    }
    return;
  }
  if (driverVals.lagSpeed === 0) {
    // initial lag.
    lagStart = performance.now();
    lagSpent = 0;
    driverVals.lagSpeed = 1;
    return;
  }
  // update lag
  lagSpent += manaSpent;
  const now = performance.now();
  const measuredSpeed = lagSpent / (now - lagStart) * 1000 / driverVals.baseManaPerSecond;
  driverVals.lagSpeed = measuredSpeed;
}

export function addOffline(num) {
  if (num) {
    if (vals.totalOfflineMs + num < 0 && bonusSpeed > 1) {
      toggleOffline();
    }
    vals.totalOfflineMs += num;
    if (vals.totalOfflineMs < 0) {
      vals.totalOfflineMs = 0;
    }
  }
}

export function toggleOffline() {
  if (vals.totalOfflineMs === 0) return;
  if (!isBonusActive()) {
    bonusSpeed = 5;
    bonusActive = true;
    checkExtraSpeed();
  } else {
    bonusSpeed = 1;
    bonusActive = false;
  }
  setOption('bonusIsActive', bonusActive, true);
  view.requestUpdate('updateTime', null);
}

let bonusSpeed = 1;
let bonusActive = false;
export function isBonusActive() {
  return bonusActive && bonusSpeed !== 1;
}

export function checkExtraSpeed() {
  if (
    typeof vals.options.speedIncreaseBackground === 'number' &&
    !isNaN(vals.options.speedIncreaseBackground) &&
    vals.options.speedIncreaseBackground >= 0 && !document.hasFocus() &&
    (vals.options.speedIncreaseBackground < 1 || isBonusActive())
  ) {
    if (vals.options.speedIncreaseBackground === 1) {
      bonusSpeed = 1.00001;
    } else if (vals.options.speedIncreaseBackground === 0) {
      bonusSpeed = 0.0000001; // let's avoid any divide by zero errors shall we
    } else {
      bonusSpeed = vals.options.speedIncreaseBackground;
    }
    return;
  }
  if (!isBonusActive()) {
    bonusSpeed = 1;
    return;
  }
  if (bonusSpeed < vals.options.speedIncreaseCustom) {
    bonusSpeed = vals.options.speedIncreaseCustom;
  }
}

export const driverVals = {
  lagSpeed: 0,
  effectiveTime: 0,
  timeCounter: 0,
  baseManaPerSecond: 50,
  gameSpeed: 1,
};
