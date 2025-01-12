import {
  Buff,
  getBuffLevel,
  getLevel,
  getPrcToNextLevel,
  getPrcToNextSkillLevel,
  getPrcToNextTalent,
  getSelfCombat,
  getSkillBonus,
  getSkillLevel,
  getTalent,
  getTeamCombat,
  getTotalBonusXP,
} from '../original/stats.ts';
import {
  Action,
  actionsWithGoldCost,
  actionTypes,
  getActionPrototype,
  getExploreExpSinceLastProgress,
  getExploreExpToNextProgress,
  getExploreProgress,
  getExploreSkill,
  getPossibleTravel,
  getTravelNum,
  getXMLName,
  hasLimit,
  isActionOfType,
  isTraining,
  townNames,
  translateClassNames,
} from '../original/actionList.ts';
import { isBuffName, saveUISettings, vals } from '../original/saving.ts';

import $ from 'jquery';
import * as d3 from 'd3';
import { StatGraph } from '../original/stats-graph.ts';
import { Localization } from '../original/localization.ts';
import { KeyboardKey } from '../keyboard.hotkeys.ts';
import { getPrestigeCost, getPrestigeCurrentBonus, prestigeValues } from '../original/prestige.ts';
import { camelize, formatNumber, intToString, intToStringRound, toSuffix } from '../original/helpers.ts';
import { getNumOnList } from '../original/actions.ts';
import { actions } from '../original/actions.ts';
import {
  actionLog,
  buffCaps,
  buffHardCaps,
  buffList,
  buffs,
  resources,
  skillList,
  skills,
  statList,
  stats,
  towns,
} from '../original/globals.ts';
import {
  addActionToList,
  addLoop,
  adjustAll,
  capAction,
  collapse,
  disableAction,
  driverVals,
  getActualGameSpeed,
  handleDirectActionDragEnd,
  handleDirectActionDragStart,
  handleDragDrop,
  handleDragOver,
  handleDragStart,
  hideNotification,
  isBonusActive,
  moveDown,
  moveUp,
  removeAction,
  removeLoop,
  showActionIcons,
  showNotification,
  split,
} from '../original/driver.ts';
import { Koviko } from '../original/predictor.ts';

const DarkRitualDescription = [
  `10% faster in Beginnersville per ritual from 1-20<br>`,
  `5% faster in the Forest Path per ritual from 21-40<br>`,
  `2.5% faster in Merchanton per ritual from 41-60<br>`,
  `1.5% faster in Mt. Olympus per ritual from 61-80<br>`,
  `1.0% faster in Valhalla per ritual from 81-100<br>`,
  `0.5% faster in Startington per ritual from 101-150<br>`,
  `0.5% faster in Jungle Path per ritual from 151-200<br>`,
  `0.5% faster in Commerceville per ritual from 201-250<br>`,
  `0.5% faster in Valley of Olympus per ritual from 251-300<br>`,
  `0.1% faster globally per ritual from 301-666`,
];

export function formatTime(seconds) {
  if (seconds > 300) {
    let second = Math.floor(seconds % 60);
    let minute = Math.floor(seconds / 60 % 60);
    let hour = Math.floor(seconds / 60 / 60 % 24);
    let day = Math.floor(seconds / 60 / 60 / 24);

    let timeString = '';
    if (day > 0) timeString += day + 'd ';
    if (day > 0 || hour > 0) timeString += hour + 'h ';
    if (day > 0 || hour > 0 || minute > 0) timeString += minute + 'm ';
    timeString += second + 's';

    return timeString;
  }
  if (Number.isInteger(seconds)) {
    return (formatNumber(seconds) + Localization.txt('time_controls>seconds')).replace(
      /\B(?=(\d{3})+(?!\d))/gu,
      ',',
    );
  }
  if (seconds < 10) {
    return seconds.toFixed(2) + Localization.txt('time_controls>seconds');
  }
  return (seconds.toFixed(1) + Localization.txt('time_controls>seconds')).replace(
    /\B(?=(\d{3})+(?!\d))/gu,
    ',',
  );
}

let statShowing;
let skillShowing;
let buffShowing;
let curActionShowing;
let dungeonShowing;

let curActionsDiv;
let nextActionsDiv;
let actionOptionsTown;
let actionStoriesTown;
let townInfos;

export class View {
  initalize() {
    curActionsDiv = document.getElementById('curActionsList');
    nextActionsDiv = document.getElementById('nextActionsList');
    actionOptionsTown = [];
    for (let i = 0; i <= 8; i++) {
      const element = document.getElementById(`actionOptionsTown${i}`);
      if (!element) continue;

      const actionDiv = document.createElement('div');
      actionDiv.classList.add('actionDiv');
      element.append(actionDiv);

      const travelDiv = document.createElement('div');
      travelDiv.classList.add('travelDiv');
      element.append(travelDiv);

      actionOptionsTown[i] = element;
    }

    actionStoriesTown = [];
    for (let i = 0; i <= 8; i++) {
      actionStoriesTown[i] = document.getElementById(`actionStoriesTown${i}`);
    }

    townInfos = [];
    for (let i = 0; i <= 8; i++) {
      townInfos[i] = document.getElementById(`townInfo${i}`);
    }

    this.statGraph = new StatGraph();

    this.createTravelMenu();
    this.createStats();
    this.updateStats();
    this.updateSkills();
    this.adjustDarkRitualText();
    this.updateBuffs();
    this.updateTime();
    this.updateCurrentActionsDivs();
    this.updateTotalTicks();
    this.updateAddAmount(1);
    this.createTownActions();
    this.updateProgressActions();
    this.updateLockedHidden();
    this.updateSoulstones();
    this.showTown(0);
    this.showActions(false);
    this.updateTrainingLimits();
    this.changeStatView();
    this.adjustGoldCosts();
    this.adjustExpGains();
    this.updateTeamCombat();
    this.updateLoadoutNames();
    this.updateResources();
    this.updateTrials();
    if (vals.storyMax >= 12) {
      setInterval(() => {
        view.updateStories();
        view.updateLockedHidden();
      }, 20000);
    } else {
      setInterval(() => {
        view.updateStories();
        view.updateLockedHidden();
      }, 2000);
    }
    adjustAll();
    this.updateActionTooltips();
    this.initActionLog();
    document.body.removeEventListener('mouseover', this.mouseoverHandler);
    document.body.addEventListener('mouseover', this.mouseoverHandler, { passive: true });
    document.body.removeEventListener('focusin', this.mouseoverHandler);
    document.body.addEventListener('focusin', this.mouseoverHandler, { passive: true });
    globalThis.addEventListener('modifierkeychange', this.modifierkeychangeHandler);

    this.tooltipTriggerMap = new WeakMap();
    this.mouseoverCount = 0;
  }

  constructor() {
    this.mouseoverHandler = this.mouseoverHandler.bind(this);
    this.modifierkeychangeHandler = this.modifierkeychangeHandler.bind(this);
  }

  mouseoverHandler() {
  }

  modifierkeychangeHandler() {
    document.getElementById('clearList').textContent = KeyboardKey.shift
      ? Localization.txt('actions>tooltip>clear_disabled')
      : Localization.txt('actions>tooltip>clear_list');
  }

  getClosestTrigger(element) {
    let trigger = this.tooltipTriggerMap.get(element);
    if (trigger == null) {
      trigger = element.closest('.showthat,.showthatO,.showthat,.contains-popover,.showthatloadout,.showthatstory') ||
        false;
      this.tooltipTriggerMap.set(element, trigger);
    }
    return trigger;
  }

  createStats() {
    if (this.statGraph.initalized) return;

    this.statGraph.init(document.getElementById('statsContainer'));
    const totalContainer = document.getElementById('totalStatContainer');
    for (const stat of statList) {
      const axisTip = this.statGraph.getAxisTip(stat);
      totalContainer.insertAdjacentHTML(
        'beforebegin',
        `<div id='stat${stat}' class='statContainer showthat stat-${stat}' style='left:${axisTip[0]}%;top:${
          axisTip[1] + 3
        }%;'>
                <div class='statLabelContainer'>
                    <div class='medium bold stat-name long-form' style='margin-left:18px;margin-top:5px;'>${
          Localization.txt(`stats>${stat}>long_form`)
        }</div>
                    <div class='medium bold stat-name short-form' style='margin-left:18px;margin-top:5px;'>${
          Localization.txt(`stats>${stat}>short_form`)
        }</div>
                    <div class='medium statNum stat-soulstone' style='color:var(--stat-soulstone-color);' id='stat${stat}ss'></div>
                    <div class=' statNum stat-talent'></div>
                    <div class='medium statNum stat-talent statBarWrapper'>
                        <div class='thinProgressBarLower tiny talentBar'><div class='statBar statTalentBar' id='stat${stat}TalentBar'></div></div>
                        <div class='label' id='stat${stat}Talent'>0</div>
                    </div>
                    <div class='medium statNum stat-level statBarWrapper'>
                        <div class='thinProgressBarLower tiny expBar'><div class='statBar statLevelBar' id='stat${stat}LevelBar'></div></div>
                        <div class='label bold' id='stat${stat}Level'>0</div>
                    </div>
                </div>
                <div class='statBars'>
                    <div class='thinProgressBarUpper expBar'><div class='statBar statLevelLogBar logBar' id='stat${stat}LevelLogBar'></div></div>
                    <div class='thinProgressBarLower talentBar'><div class='statBar statTalentLogBar logBar' id='stat${stat}TalentLogBar'></div></div>
                    <div class='thinProgressBarLower soulstoneBar'><div class='statBar statSoulstoneLogBar logBar' id='stat${stat}SoulstoneLogBar'></div></div>
                </div>
                <div class='showthis' id='stat${stat}Tooltip' style='width:225px;'>
                    <div class='medium bold'>${Localization.txt(`stats>${stat}>long_form`)}</div><br>${
          Localization.txt(`stats>${stat}>blurb`)
        }
                    <br>
                    <div class='medium bold'>${
          Localization.txt('stats>tooltip>level')
        }:</div> <div id='stat${stat}Level2'></div>
                    <br>
                    <div class='medium bold'>${Localization.txt('stats>tooltip>level_exp')}:</div>
                    <div id='stat${stat}LevelExp'></div>/<div id='stat${stat}LevelExpNeeded'></div>
                    <div class='statTooltipPerc'>(<div id='stat${stat}LevelProgress'></div>%)</div>
                    <br>
                    <div class='medium bold'>${Localization.txt('stats>tooltip>talent')}:</div>
                    <div id='stat${stat}Talent2'></div>
                    <br>
                    <div class='medium bold'>${Localization.txt('stats>tooltip>talent_exp')}:</div>
                    <div id='stat${stat}TalentExp'></div>/<div id='stat${stat}TalentExpNeeded'></div>
                    <div class='statTooltipPerc'>(<div id='stat${stat}TalentProgress'></div>%)</div>
                    <br>
                    <div class='medium bold'>${Localization.txt('stats>tooltip>talent_multiplier')}:</div>
                    x<div id='stat${stat}TalentMult'></div>
                    <br>
                    <div id='ss${stat}Container' class='ssContainer'>
                        <div class='bold'>${
          Localization.txt('stats>tooltip>soulstone')
        }:</div> <div id='ss${stat}'></div><br>
                        <div class='medium bold'>${
          Localization.txt('stats>tooltip>soulstone_multiplier')
        }:</div> x<div id='stat${stat}SSBonus'></div>
                    </div><br>
                    <div class='medium bold'>${
          Localization.txt('stats>tooltip>total_multiplier')
        }:</div> x<div id='stat${stat}TotalMult'></div>
                </div>
            </div>`,
      );
    }
  }

  // requests are properties, where the key is the function name,
  // and the array items in the value are the target of the function

  requests = {
    updateStats: [],
    updateStat: [],
    updateSkill: [],
    updateSkills: [],
    updateBuff: [],
    updateTrialInfo: [],
    updateTrials: [],
    updateRegular: [],
    updateProgressAction: [],
    updateMultiPartSegments: [],
    updateMultiPart: [],
    updateMultiPartActions: [],
    updateNextActions: [],
    updateTime: [],
    updateOffline: [],
    updateBonusText: [],
    updateTotals: [],
    updateStories: [],
    updateGlobalStory: [],
    updateActionLogEntry: [],
    updateCurrentActionBar: [],
    updateCurrentActionsDivs: [],
    updateTotalTicks: [],
    updateCurrentActionLoops: [],
    updateSoulstones: [],
    updateResource: [],
    updateResources: [],
    updateActionTooltips: [],
    updateLockedHidden: [],
    updateTravelMenu: [],
    updateTeamCombat: [],
    adjustManaCost: [],
    adjustGoldCost: [],
    adjustGoldCosts: [],
    adjustExpGain: [],
    removeAllHighlights: [],
    highlightIncompleteActions: [],
    highlightAction: [],
  };

  // requesting an update will call that update on the next view.update tick (based off player set UPS)
  requestUpdate(category, target) {
    if (!this.requests[category].includes(target)) this.requests[category].push(target);
  }

  handleUpdateRequests() {
    for (const category in this.requests) {
      for (const target of this.requests[category]) {
        this[category](target);
      }
      this.requests[category] = [];
    }
  }

  update() {
    this.handleUpdateRequests();

    if (dungeonShowing !== undefined) this.updateSoulstoneChance(dungeonShowing);
    if (this.updateStatGraphNeeded) this.statGraph.update();
    this.updateTime();
  }

  adjustTooltipPosition(tooltipDiv) {
  }

  /**
   * @param {HTMLElement} tooltip
   * @param {Element} trigger
   * @param {Node} eventTarget
   */
  fixTooltipPosition(tooltip, trigger, eventTarget, delayedCall = false) {
    if (tooltip.contains(eventTarget)) {
      // console.log("Not fixing tooltip while cursor is inside",{tooltip,trigger,event});
      return;
    }
    if (!trigger.parentElement) {
      // trigger has been removed from document, abort
      return;
    }
    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportRect = {
      // document.documentElement.getBoundingClientRect();
      top: 0,
      left: 0,
      right: globalThis.innerWidth,
      bottom: globalThis.innerHeight,
    };
    const viewportMargins = {
      top: triggerRect.top - viewportRect.top,
      right: viewportRect.right - triggerRect.right,
      bottom: viewportRect.bottom - triggerRect.bottom,
      left: triggerRect.left - viewportRect.left,
    };
    const triggerParentStyle = getComputedStyle(trigger.parentElement);
    const wantsSidePosition = triggerParentStyle.display === 'flex' && triggerParentStyle.flexDirection === 'column';

    // We prefer to display tooltips above or below the trigger, except in the action list and the changelog
    let displayOverUnder = true;
    if (tooltipRect.height > Math.max(viewportMargins.top, viewportMargins.bottom)) displayOverUnder = false;
    if (wantsSidePosition && tooltipRect.width <= Math.max(viewportMargins.left, viewportMargins.right)) {
      displayOverUnder = false;
    }

    const targetPos = {
      x: 0,
      y: 0,
    };

    if (displayOverUnder) {
      targetPos.y = viewportMargins.top > viewportMargins.bottom
        ? triggerRect.top - tooltipRect.height
        : triggerRect.bottom;
      targetPos.x = viewportMargins.left > viewportMargins.right && tooltipRect.width > triggerRect.width
        ? triggerRect.right - tooltipRect.width
        : triggerRect.left;
    } else {
      targetPos.x = viewportMargins.left > viewportMargins.right
        ? triggerRect.left - tooltipRect.width
        : triggerRect.right;
      targetPos.y = viewportMargins.top > viewportMargins.bottom
        ? triggerRect.bottom - tooltipRect.height
        : triggerRect.top;
    }

    // check all bounds and nudge the tooltip back onto the screen if necessary, favoring the
    // top and left edges. don't trust the trbl on tooltipRect, since adjusting those isn't in spec.
    targetPos.x = Math.min(targetPos.x, viewportRect.right - tooltipRect.width);
    targetPos.y = Math.min(targetPos.y, viewportRect.bottom - tooltipRect.height);
    targetPos.x = Math.max(targetPos.x, viewportRect.left);
    targetPos.y = Math.max(targetPos.y, viewportRect.top);

    // console.log("Fixing tooltip:",{tooltip,tooltipRect,trigger,triggerRect,event});

    // Now, check and see if we can do a nudge (valid rect, currently fixed) or if we have to do initial position
    const curLeft = parseFloat(tooltip.style.left);
    const curTop = parseFloat(tooltip.style.top);
    if (
      tooltip.style.position === 'fixed' && isFinite(curLeft) && isFinite(curTop) && tooltipRect.width > 0 &&
      tooltipRect.height > 0
    ) {
      // simple nudge
      tooltip.style.left = `${curLeft + targetPos.x - tooltipRect.x}px`;
      tooltip.style.top = `${curTop + targetPos.y - tooltipRect.y}px`;
    } else {
      // initial positioning
      tooltip.style.position = 'fixed';
      tooltip.style.left = `${targetPos.x - viewportRect.left}px`;
      tooltip.style.top = `${targetPos.y - viewportRect.top}px`;
      tooltip.style.right = 'auto';
      tooltip.style.bottom = 'auto';
      tooltip.style.margin = '0';
      if (!delayedCall) {
        // queue up a nudge ASAP, but avoid infinite recursion
        requestAnimationFrame(() => this.fixTooltipPosition(tooltip, trigger, eventTarget, true));
      }
    }
  }

  showStat(stat) {
    statShowing = stat;
    if (stat !== undefined) this.updateStat(stat);
  }

  updateStatGraphNeeded = false;

  updateStat(stat) {
    const level = getLevel(stat);
    const talent = getTalent(stat);
    const totalLevel = Object.values(stats).map((s) => s.statLevelExp.level).reduce((a, b) => a + b);
    const totalTalent = Object.values(stats).map((s) => s.talentLevelExp.level).reduce((a, b) => a + b);
    const levelPrc = `${getPrcToNextLevel(stat)}%`;
    const talentPrc = `${getPrcToNextTalent(stat)}%`;

    this.updateLevelLogBar('statsContainer', `stat${stat}LevelLogBar`, level, `stat${stat}LevelBar`, levelPrc);
    this.updateLevelLogBar('statsContainer', `stat${stat}TalentLogBar`, talent, `stat${stat}TalentBar`, talentPrc);

    document.getElementById(`stat${stat}Level`).textContent = intToString(level, 1);
    document.getElementById(`stat${stat}Talent`).textContent = intToString(talent, 1);
    document.getElementById(`stattotalLevel`).textContent = intToString(totalLevel, 1);
    document.getElementById(`stattotalTalent`).textContent = intToString(totalTalent, 1);
    document.getElementById(`stattotalLevel2`).textContent = formatNumber(totalLevel);
    document.getElementById(`stattotalTalent2`).textContent = formatNumber(totalTalent);

    if (statShowing === stat || document.getElementById(`stat${stat}LevelExp`).innerHTML === '') {
      document.getElementById(`stat${stat}Level2`).textContent = formatNumber(level);
      document.getElementById(`stat${stat}LevelExp`).textContent = intToString(
        stats[stat].statLevelExp.exp,
        1,
      );
      document.getElementById(`stat${stat}LevelExpNeeded`).textContent = intToString(
        stats[stat].statLevelExp.expRequiredForNextLevel,
        1,
      );
      document.getElementById(`stat${stat}LevelProgress`).textContent = intToString(levelPrc, 2);

      document.getElementById(`stat${stat}Talent2`).textContent = formatNumber(talent);
      document.getElementById(`stat${stat}TalentExp`).textContent = intToString(
        stats[stat].talentLevelExp.exp,
        1,
      );
      document.getElementById(`stat${stat}TalentExpNeeded`).textContent = intToString(
        stats[stat].talentLevelExp.expRequiredForNextLevel,
        1,
      );
      document.getElementById(`stat${stat}TalentMult`).textContent = intToString(
        stats[stat].talentMult,
        3,
      );
      document.getElementById(`stat${stat}TalentProgress`).textContent = intToString(talentPrc, 2);
      document.getElementById(`stat${stat}TotalMult`).textContent = intToString(
        getTotalBonusXP(stat),
        3,
      );
    }
  }

  logBarScaleBase = 1.25;

  getMaxLogBarScale(maxValue) {
    return this.logBarScaleBase ** Math.ceil(Math.log(maxValue) / Math.log(this.logBarScaleBase));
  }

  /**
   * @param {string} maxContainerId
   * @param {string} logBarId
   * @param {number} level
   * @param {string} [levelBarId]
   * @param {string} [levelPrc]
   */
  updateLevelLogBar(maxContainerId, logBarId, level, levelBarId, levelPrc) {
    const maxContainer = document.getElementById(maxContainerId);
    const logLevel = level; //Math.log10(level);
    let maxValue = parseFloat(getComputedStyle(maxContainer).getPropertyValue('--max-bar-value')) || 0;

    const logBar = document.getElementById(logBarId);
    if (level > maxValue) {
      maxValue = this.getMaxLogBarScale(level + 1);
      maxContainer.style.setProperty('--max-bar-value', String(maxValue));
    }
    logBar.style.setProperty('--bar-value', String(logLevel));
    if (levelBarId) document.getElementById(levelBarId).style.width = levelPrc;
  }

  updateStats(skipAnimation) {
    let maxValue = 100; // I really need to stop writing this default explicitly everywhere
    for (const stat of statList) {
      for (
        const value of [
          getLevel(stat),
          getTalent(stat),
          stats[stat].soulstone,
        ]
      ) {
        maxValue = Math.max(value, maxValue);
      }
    }
    maxValue = this.getMaxLogBarScale(maxValue);
    const statsContainer = document.getElementById('statsContainer');
    if (skipAnimation) {
      statsContainer.classList.remove('animate-logBars');
      this.statGraph.update(true);
    }
    statsContainer.style.setProperty('--max-bar-value', String(maxValue));
    if (!statsContainer.classList.contains('animate-logBars')) {
      requestAnimationFrame(() => statsContainer.classList.add('animate-logBars'));
    }

    for (const stat of statList) {
      this.updateStat(stat);
    }
  }

  showSkill(skill) {
    skillShowing = skill;
    if (skill !== undefined) this.updateSkill(skill);
  }

  updateSkill(skill) {
    if (skills[skill].levelExp.level === 0) {
      document.getElementById(`skill${skill}Container`).style.display = 'none';
      return;
    }
    let container = document.getElementById(`skill${skill}Container`);
    container.style.display = 'inline-block';
    if (skill === 'Combat' || skill === 'Pyromancy' || skill === 'Restoration') {
      this.updateTeamCombat();
    }

    const levelPrc = getPrcToNextSkillLevel(skill);
    document.getElementById(`skill${skill}Level`).textContent = (getSkillLevel(skill) > 9999)
      ? toSuffix(getSkillLevel(skill))
      : formatNumber(getSkillLevel(skill));
    document.getElementById(`skill${skill}LevelBar`).style.width = `${levelPrc}%`;

    if (skillShowing === skill) {
      document.getElementById(`skill${skill}LevelExp`).textContent = intToString(
        skills[skill].levelExp.exp,
        1,
      );
      document.getElementById(`skill${skill}LevelExpNeeded`).textContent = intToString(
        skills[skill].levelExp.expRequiredForNextLevel,
        1,
      );
      document.getElementById(`skill${skill}LevelProgress`).textContent = intToString(levelPrc, 2);

      if (skill === 'Dark') {
        document.getElementById('skillBonusDark').textContent = intToString(
          getSkillBonus('Dark'),
          4,
        );
      } else if (skill === 'Chronomancy') {
        document.getElementById('skillBonusChronomancy').textContent = intToString(
          getSkillBonus('Chronomancy'),
          4,
        );
      } else if (skill === 'Practical') {
        document.getElementById('skillBonusPractical').textContent = getSkillBonus('Practical')
          .toFixed(3).replace(
            /(\.\d*?[1-9])0+$/gu,
            '$1',
          );
      } else if (skill === 'Mercantilism') {
        document.getElementById('skillBonusMercantilism').textContent = intToString(
          getSkillBonus('Mercantilism'),
          4,
        );
      } else if (skill === 'Spatiomancy') {
        document.getElementById('skillBonusSpatiomancy').textContent = getSkillBonus('Spatiomancy')
          .toFixed(3).replace(
            /(\.\d*?[1-9])0+$/gu,
            '$1',
          );
      } else if (skill === 'Divine') {
        document.getElementById('skillBonusDivine').textContent = intToString(
          getSkillBonus('Divine'),
          4,
        );
      } else if (skill === 'Commune') {
        document.getElementById('skillBonusCommune').textContent = getSkillBonus('Commune').toFixed(3)
          .replace(
            /(\.\d*?[1-9])0+$/gu,
            '$1',
          );
      } else if (skill === 'Wunderkind') {
        document.getElementById('skillBonusWunderkind').textContent = intToString(
          getSkillBonus('Wunderkind'),
          4,
        );
      } else if (skill === 'Gluttony') {
        document.getElementById('skillBonusGluttony').textContent = getSkillBonus('Gluttony').toFixed(
          3,
        ).replace(
          /(\.\d*?[1-9])0+$/gu,
          '$1',
        );
      } else if (skill === 'Thievery') {
        document.getElementById('skillBonusThievery').textContent = intToString(
          getSkillBonus('Thievery'),
          4,
        );
      } else if (skill === 'Leadership') {
        document.getElementById('skillBonusLeadership').textContent = intToString(
          getSkillBonus('Leadership'),
          4,
        );
      } else if (skill === 'Assassin') {
        document.getElementById('skillBonusAssassin').textContent = intToString(
          getSkillBonus('Assassin'),
          4,
        );
      }
    }
    this.adjustTooltipPosition(container.querySelector('div.showthis'));
  }

  updateSkills() {
    for (const skill of skillList) {
      this.updateSkill(skill);
    }
  }

  showBuff(buff) {
    buffShowing = buff;
    if (buff !== undefined) this.updateBuff(buff);
  }

  updateBuff(buff) {
    if (buffs[buff].amt === 0) {
      document.getElementById(`buff${buff}Container`).style.display = 'none';
      return;
    }
    let container = document.getElementById(`buff${buff}Container`);
    container.style.display = 'flex';
    document.getElementById(`buff${buff}Level`).textContent = `${getBuffLevel(buff)}/`;
    if (buff === 'Imbuement') {
      this.updateTrainingLimits();
    }
    this.adjustTooltipPosition(container.querySelector('div.showthis'));
  }

  updateBuffs() {
    for (const buff of buffList) {
      this.updateBuff(buff);
    }
  }

  updateTime() {
    document.getElementById('timeBar').style.width = `${100 - vals.timer / vals.timeNeeded * 100}%`;
    document.getElementById('timer').textContent = `${
      intToString(
        vals.timeNeeded - vals.timer,
        vals.options.fractionalMana ? 2 : 1,
        true,
      )
    } | ${formatTime((vals.timeNeeded - vals.timer) / 50 / getActualGameSpeed())}`;
    this.adjustGoldCost({ varName: 'Wells', cost: Action.ManaWell.goldCost() });
  }
  updateOffline() {
    document.getElementById('bonusSeconds').textContent = formatTime(vals.totalOfflineMs / 1000);
    const returnTimeButton = document.getElementById('returnTimeButton');
    if (returnTimeButton instanceof HTMLButtonElement) {
      returnTimeButton.disabled = vals.totalOfflineMs < 86400_000;
    }
  }
  updateBonusText() {
    const element = document.getElementById('bonusText');
    if (!element) return;
    element.innerHTML = this.getBonusText() ?? '';
  }
  getBonusText() {
    let text = Localization.txt('time_controls>bonus_seconds>main_text');
    let lastText = null;
    while (lastText !== text) {
      lastText = text;
      text = text?.replace(/{([^+{}-]*)([+-]?)(.*?)}/g, (_str, lhs, op, rhs) => this.getBonusReplacement(lhs, op, rhs));
    }
    return text;
  }

  getBonusReplacement(lhs, op, rhs) {
    // this is the second time I've manually implemented this text-replacement pattern (first was for Action Log entries). Next time I need to make it a
    // generic operation on Localization; I think I'm beginning to figure out what will be needed for it
    const fgSpeed = Math.max(
      5,
      vals.options.speedIncrease10x ? 10 : 0,
      vals.options.speedIncrease20x ? 20 : 0,
      vals.options.speedIncreaseCustom,
    );
    const bgSpeed = !isFinite(vals.options.speedIncreaseBackground) ? -1 : vals.options.speedIncreaseBackground ?? -1;
    const variables = {
      __proto__: null, // toString is not a valid replacement name
      get background_info() {
        if (bgSpeed < 0 || bgSpeed === fgSpeed) {
          return Localization.txt('time_controls>bonus_seconds>background_disabled');
        } else if (bgSpeed === 0) {
          return Localization.txt('time_controls>bonus_seconds>background_0x');
        } else if (bgSpeed < 1) {
          return Localization.txt('time_controls>bonus_seconds>background_regen');
        } else if (bgSpeed === 1) {
          return Localization.txt('time_controls>bonus_seconds>background_1x');
        } else if (bgSpeed < fgSpeed) {
          return Localization.txt('time_controls>bonus_seconds>background_slower');
        } else {
          return Localization.txt('time_controls>bonus_seconds>background_faster');
        }
      },
      get state() {
        return `<span class='bold' id='isBonusOn'>${
          Localization.txt(
            `time_controls>bonus_seconds>state>${isBonusActive() ? 'on' : 'off'}`,
          )
        }</span>`;
      },
      get counter_text() {
        return `<span class='bold'>${Localization.txt('time_controls>bonus_seconds>counter_text')}</span>`;
      },
      get bonusSeconds() {
        return `<span id='bonusSeconds'>${formatTime(vals.totalOfflineMs / 1000)}</span>`;
      },
      get lag_warning() {
        return driverVals.lagSpeed > 0 ? Localization.txt('time_controls>bonus_seconds>lag_warning') : '';
      },
      speed: fgSpeed,
      background_speed: bgSpeed,
      lagSpeed: driverVals.lagSpeed,
    };
    const lval = variables[lhs] ?? (parseFloat(lhs) || 0);
    const rval = variables[rhs] ?? (parseFloat(rhs) || 0);
    return String(
      op === '+' ? lval + rval : op === '-' ? lval - rval : lval,
    );
  }
  updateTotalTicks() {
    document.getElementById('totalTicks').textContent = `${formatNumber(actions.completedTicks)} | ${
      formatTime(driverVals.timeCounter)
    }`;
    document.getElementById('effectiveTime').textContent = `${formatTime(driverVals.effectiveTime)}`;
  }
  updateResource(resource) {
    const element = document.getElementById(`${resource}Div`, false, false);
    if (element) element.style.display = resources[resource] ? 'inline-block' : 'none';

    if (resource === 'supplies') {
      document.getElementById('suppliesCost').textContent = String(towns[0].suppliesCost);
    }
    if (resource === 'teamMembers') {
      document.getElementById('teamCost').textContent = `${(resources.teamMembers + 1) * 100}`;
    }

    if (Number.isFinite(resources[resource])) {
      document.getElementById(resource).textContent = resources[resource];
    }
  }
  updateResources() {
    for (const resource in resources) this.updateResource(resource);
  }
  updateActionTooltips() {
    document.getElementById('goldInvested').textContent = intToStringRound(
      vals.goldInvested,
    );
    document.getElementById('bankInterest').textContent = intToStringRound(
      vals.goldInvested * .001,
    );
    document.getElementById('actionAllowedPockets').textContent = intToStringRound(
      towns[7].totalPockets,
    );
    document.getElementById('actionAllowedWarehouses').textContent = intToStringRound(
      towns[7].totalWarehouses,
    );
    document.getElementById('actionAllowedInsurance').textContent = intToStringRound(
      towns[7].totalInsurance,
    );
    document.getElementById('totalSurveyProgress').textContent = `${getExploreProgress()}`;
    Array.from(document.getElementsByClassName('surveySkill')).forEach((div) => {
      div.textContent = `${getExploreSkill()}`;
    });
    for (const town of towns) {
      const varName = town.progressVars.find((v) => v.startsWith('Survey'));
      this.updateGlobalSurvey(varName, town);
    }
  }
  updateTeamCombat() {
    if (towns[2].unlocked) {
      document.getElementById('skillSCombatContainer').style.display = 'inline-block';
      document.getElementById('skillTCombatContainer').style.display = 'inline-block';
      document.getElementById('skillSCombatLevel').textContent = intToString(
        getSelfCombat(),
        1,
      );
      document.getElementById('skillTCombatLevel').textContent = intToString(
        getTeamCombat(),
        1,
      );
    } else {
      document.getElementById('skillSCombatContainer').style.display = 'none';
      document.getElementById('skillTCombatContainer').style.display = 'none';
    }
  }
  zoneTints = [
    'var(--zone-tint-1)', //Beginnersville
    'var(--zone-tint-2)', //Forest Path
    'var(--zone-tint-3)', //Merchanton
    'var(--zone-tint-4)', //Mt Olympus
    'var(--zone-tint-5)', //Valhalla
    'var(--zone-tint-6)', //Startington
    'var(--zone-tint-7)', //Jungle Path
    'var(--zone-tint-8)', //Commerceville
    'var(--zone-tint-9)', //Valley of Olympus
  ];
  highlightAction(index) {
    const element = document.getElementById(`nextActionContainer${index}`);
    if (!(element instanceof HTMLElement)) return;
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  }
  updateNextActions() {
    const { scrollTop } = nextActionsDiv; // save the current scroll position
    if (vals.options.predictor) {
      Koviko.preUpdateHandler(nextActionsDiv);
    }

    d3.select(nextActionsDiv)
      .selectAll('.nextActionContainer')
      .data(
        actions.next.map((a, index) => ({
          ...a,
          actionId: a.actionId,
          index,
          action: getActionPrototype(a.name),
        })),
        (a) => a.actionId,
      )
      .join((enter) => {
        enter.append(({ actionId: id }) => {
          const actions = {
            cap: capAction.bind(null, id),
            plus: addLoop.bind(null, id),
            minus: removeLoop.bind(null, id),
            split: split.bind(null, id),
            compress: collapse.bind(null, id),
            up: moveUp.bind(null, id),
            down: moveDown.bind(null, id),
            skip: disableAction.bind(null, id),
            remove: removeAction.bind(null, id),
          };
          const drags = {
            ondrop: handleDragDrop,
            ondragover: handleDragOver,
            ondragstart: handleDragStart,
            ondragend: draggedUndecorate.bind(null, id),
            ondragenter: dragOverDecorate.bind(null, id),
            ondragleave: dragExitUndecorate.bind(null, id),
          };

          const container = document.createElement('div');
          container.id = `nextActionContainer${id}`;
          container.classList.add('nextActionContainer', 'small', 'showthat');
          container.ondragover = drags.ondragover;
          container.ondrop = drags.ondrop;
          container.ondragstart = drags.ondragstart;
          container.ondragend = drags.ondragend;
          container.ondragenter = drags.ondragenter;
          container.ondragleave = drags.ondragleave;
          container.draggable = true;
          container.dataset.actionId = id;

          const counter = document.createElement('div');
          counter.classList.add('nextActionLoops');
          counter.innerHTML = `
            <img class='smallIcon imageDragFix'> 
            ×
            <div class='bold'></div>
          `;

          container.append(counter);

          const buttons = document.createElement('div');
          buttons.classList.add('nextActionButtons');
          const capButton = document.createElement('button');
          capButton.classList.add('capButton', 'actionIcon', 'far', 'fa-circle');
          capButton.onclick = actions.cap;
          buttons.append(capButton);

          const plusButton = document.createElement('button');
          plusButton.classList.add('plusButton', 'actionIcon', 'fas', 'fa-plus');
          plusButton.onclick = actions.plus;
          buttons.append(plusButton);

          const minusButton = document.createElement('button');
          minusButton.classList.add('minusButton', 'actionIcon', 'fas', 'fa-minus');
          minusButton.onclick = actions.minus;
          buttons.append(minusButton);

          const splitButton = document.createElement('button');
          splitButton.classList.add('splitButton', 'actionIcon', 'fas', 'fa-arrows-alt-h');
          splitButton.onclick = actions.split;
          buttons.append(splitButton);

          const compressButton = document.createElement('button');
          compressButton.classList.add('collapseButton', 'actionIcon', 'fas', 'fa-compress-alt');
          compressButton.onclick = actions.compress;
          buttons.append(compressButton);

          const upButton = document.createElement('button');
          upButton.classList.add('upButton', 'actionIcon', 'fas', 'fa-sort-up');
          upButton.onclick = actions.up;
          buttons.append(upButton);

          const downButton = document.createElement('button');
          downButton.classList.add('downButton', 'actionIcon', 'fas', 'fa-sort-down');
          downButton.onclick = actions.down;
          buttons.append(downButton);

          const skipButton = document.createElement('button');
          skipButton.classList.add('skipButton', 'actionIcon', 'far', 'fa-times-circle');
          skipButton.onclick = actions.skip;
          buttons.append(skipButton);

          const removeButton = document.createElement('button');
          removeButton.classList.add('removeButton', 'actionIcon', 'fas', 'fa-times');
          removeButton.onclick = actions.remove;
          buttons.append(removeButton);

          container.append(buttons);

          const koviko = document.createElement('ul');
          koviko.classList.add('koviko');
          container.append(koviko);

          return container;
        });
      })
      .property('data-index', (_a, i) => i)
      .call((container) => {
        for (const { index } of towns) {
          container.classed(`zone-${index + 1}`, (a) => a.action.townNum === index);
        }
        for (const type of actionTypes) {
          container.classed(`action-type-${type}`, (a) => a.action.type === type);
        }
      })
      .classed('action-has-limit', (a) => hasLimit(a.name))
      .classed('action-is-training', (a) => isTraining(a.name))
      .classed('action-is-singular', (a) => a.action.allowed?.() === 1)
      .classed('action-is-travel', (a) => getPossibleTravel(a.name).length > 0)
      .classed('action-disabled', (a) => !actions.isValidAndEnabled(a))
      .classed('user-disabled', (a) => !!a.disabled)
      .classed('user-collapsed', (a) => !!a.collapsed)
      .classed('zone-collapsed', (a) => actions.zoneSpanAtIndex(a.index).isCollapsed)
      .classed('action-is-collapsing-zone', (a) => {
        const zoneSpan = actions.zoneSpanAtIndex(a.index);
        return zoneSpan.end === a.index && zoneSpan.isCollapsed;
      })
      .style('background', ({ action }) => {
        const { townNum } = action;
        const travelNums = getPossibleTravel(action.name);
        let color = this.zoneTints[townNum];
        if (travelNums.length === 1) {
          color = `linear-gradient(${color} 49%, ${this.zoneTints[townNum + travelNums[0]]} 51%)`;
        } else if (travelNums.length > 1) {
          color = `conic-gradient(${color} 100grad, ${
            travelNums.map((travelNum, i) =>
              `${this.zoneTints[townNum + travelNum]} ${i * 200 / travelNums.length + 100}grad ${
                (i + 1) * 200 / travelNums.length + 100
              }grad`
            ).join(', ')
          }, ${color} 300grad)`;
        }
        return color;
      })
      .call((container) =>
        container
          .select('div.nextActionLoops > img')
          .property('src', (a) => `icons/${a.action.imageName}.svg`)
      )
      .call((container) =>
        container
          .select('div.nextActionLoops > div.bold')
          .text((action) => action.loops > 99999 ? toSuffix(action.loops) : formatNumber(action.loops))
      );

    if (vals.options.predictor) {
      Koviko.postUpdateHandler(actions.next, nextActionsDiv);
    }
    // scrolling down to see the new thing added is okay, scrolling up when you click an action button is not
    nextActionsDiv.scrollTop = Math.max(nextActionsDiv.scrollTop, scrollTop);
  }

  updateCurrentActionsDivs() {
    let totalDivText = '';

    // definite leak - need to remove listeners and image
    for (let i = 0; i < actions.current.length; i++) {
      const action = actions.current[i];
      const actionLoops = action.loops > 99999 ? toSuffix(action.loops) : formatNumber(action.loops);
      const actionLoopsDone = (action.loops - action.loopsLeft) > 99999
        ? toSuffix(action.loops - action.loopsLeft)
        : formatNumber(action.loops - action.loopsLeft);
      const imageName = action.name.startsWith('Assassin') ? 'assassin' : camelize(action.name);
      totalDivText += `<div id='action${i}Container' class='curActionContainer small'>
                    <div class='curActionBar' id='action${i}Bar'></div>
                    <div class='actionSelectedIndicator' id='action${i}Selected'></div>
                    <img src='icons/${imageName}.svg' class='smallIcon'>
                    <div id='action${i}LoopsDone' style='margin-left:3px; border-left: 1px solid var(--action-separator-border);padding-left: 3px;'>${actionLoopsDone}</div>
                    /<div id='action${i}Loops'>${actionLoops}</div>
                </div>`;
    }

    curActionsDiv.innerHTML = totalDivText;

    totalDivText = '';

    for (let i = 0; i < actions.current.length; i++) {
      const action = actions.current[i];
      totalDivText += `<div id='actionTooltip${i}' style='display:none;padding-left:10px;width:90%'>` +
        `<div style='text-align:center;width:100%'>${action.label}</div><br><br>` +
        `<b>${Localization.txt('actions>current_action>mana_original')}</b> <div id='action${i}ManaOrig'></div><br>` +
        `<b>${Localization.txt('actions>current_action>mana_used')}</b> <div id='action${i}ManaUsed'></div><br>` +
        `<b>${Localization.txt('actions>current_action>last_mana')}</b> <div id='action${i}LastMana'></div><br>` +
        `<b>${Localization.txt('actions>current_action>mana_remaining')}</b> <div id='action${i}Remaining'></div><br>` +
        `<b>${
          Localization.txt('actions>current_action>gold_remaining')
        }</b> <div id='action${i}GoldRemaining'></div><br>` +
        `<b>${Localization.txt('actions>current_action>time_spent')}</b> <div id='action${i}TimeSpent'></div><br>` +
        `<b>${
          Localization.txt('actions>current_action>total_time_elapsed')
        }</b> <div id='action${i}TotalTimeElapsed'></div><br>` +
        `<br>` +
        `<div id='action${i}ExpGain'></div>` +
        `<div id='action${i}HasFailed' style='display:none'>` +
        `<b>${Localization.txt('actions>current_action>failed_attempts')}</b> <div id='action${i}Failed'></div><br>` +
        `<b>${Localization.txt('actions>current_action>error')}</b> <div id='action${i}Error'></div>` +
        `</div>` +
        `</div>`;
    }

    document.getElementById('actionTooltipContainer').innerHTML = totalDivText;
    this.mouseoverAction(0, false);
  }

  updateCurrentActionBar(index) {
    const div = document.getElementById(`action${index}Bar`);
    if (!div) {
      return;
    }
    const action = actions.current[index];
    if (!action) {
      return;
    }
    if (action.errorMessage) {
      document.getElementById(`action${index}Failed`).textContent = `${action.loopsLeft}`;
      document.getElementById(`action${index}Error`).textContent = action.errorMessage;
      document.getElementById(`action${index}HasFailed`).style.display = '';
      div.style.width = '100%';
      div.style.backgroundColor = 'var(--cur-action-error-indicator)';
      div.style.height = '30%';
      div.style.marginTop = '5px';
      if (action.name === 'Heal The Sick') setStoryFlag('failedHeal');
      if (
        action.name === 'Brew Potions' && resources.reputation >= 0 &&
        resources.herbs >= 10
      ) {
        setStoryFlag('failedBrewPotions');
      }
      if (
        action.name === 'Brew Potions' && resources.reputation < 0 &&
        resources.herbs >= 10
      ) {
        setStoryFlag('failedBrewPotionsNegativeRep');
      }
      if (action.name === 'Gamble' && resources.reputation < -5) setStoryFlag('failedGamble');
      if (
        action.name === 'Gamble' && resources.gold < 20 &&
        resources.reputation > -6
      ) {
        setStoryFlag('failedGambleLowMoney');
      }
      if (action.name === 'Gather Team') setStoryFlag('failedGatherTeam');
      if (action.name === 'Craft Armor') setStoryFlag('failedCraftArmor');
      if (action.name === 'Imbue Body') setStoryFlag('failedImbueBody');
      if (action.name === 'Accept Donations') setStoryFlag('failedReceivedDonations');
      if (action.name === 'Raise Zombie') setStoryFlag('failedRaiseZombie');
    } else if (action.loopsLeft === 0) {
      div.style.width = '100%';
      div.style.backgroundColor = 'var(--cur-action-completed-background)';
    } else {
      div.style.width = `${100 * action.ticks / action.adjustedTicks}%`;
    }

    // only update tooltip if it's open
    if (curActionShowing === index) {
      document.getElementById(`action${index}ManaOrig`).textContent = intToString(
        action.manaCost() * action.loops,
        vals.options.fractionalMana ? 3 : 1,
      );
      document.getElementById(`action${index}ManaUsed`).textContent = intToString(
        action.manaUsed,
        vals.options.fractionalMana ? 3 : 1,
      );
      document.getElementById(`action${index}LastMana`).textContent = intToString(
        action.lastMana,
        3,
      );
      document.getElementById(`action${index}Remaining`).textContent = intToString(
        action.manaRemaining,
        vals.options.fractionalMana ? 3 : 1,
      );
      document.getElementById(`action${index}GoldRemaining`).textContent = formatNumber(
        action.goldRemaining,
      );
      document.getElementById(`action${index}TimeSpent`).textContent = formatTime(action.timeSpent);
      document.getElementById(`action${index}TotalTimeElapsed`).textContent = formatTime(action.effectiveTimeElapsed);

      let statExpGain = '';
      const expGainDiv = document.getElementById(`action${index}ExpGain`);
      while (expGainDiv.firstChild) {
        expGainDiv.removeChild(expGainDiv.firstChild);
      }
      for (const stat of statList) {
        if (action[`statExp${stat}`]) {
          statExpGain += `<div class='bold'>${Localization.txt(`stats>${stat}>short_form`)}:</div> ${
            intToString(action[`statExp${stat}`], 2)
          }<br>`;
        }
      }
      expGainDiv.innerHTML = statExpGain;
    }
  }

  actionLogClearHTML;

  actionLogObserver;
  initActionLog() {
    const log = document.getElementById('actionLog');
    this.actionLogClearHTML ??= log.innerHTML;
    this.actionLogObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target !== log) continue;
        // console.log(entry,entry.target,log,log.scrollTop,log.scrollHeight,log.clientHeight,log.lastScroll);
        // check the most recent position of the scroll bottom
        const { scrollTop, scrollHeight, clientHeight, lastScroll } = log;
        const lastScrollBottom = lastScroll
          ? lastScroll.scrollHeight - (lastScroll.scrollTop + lastScroll.clientHeight)
          : 0;
        // check the current position
        const scrollBottom = scrollHeight - (scrollTop + clientHeight);
        // shift by that delta
        log.scrollTop += scrollBottom - lastScrollBottom;
      }
    });
    this.actionLogObserver.observe(log);
    log.addEventListener('scroll', this.recordScrollPosition, { passive: true });
    log.addEventListener('scrollend', this.recordScrollPosition, { passive: true });
  }

  recordScrollPosition() {
    const { scrollTop, scrollHeight, clientHeight } = this;
    this.lastScroll = { scrollTop, scrollHeight, clientHeight };
  }
  updateActionLogEntry(index) {
    const log = document.getElementById('actionLog');
    this.actionLogClearHTML ??= log.innerHTML;
    if (index === 'clear') {
      log.innerHTML = this.actionLogClearHTML; // nuke it, dot it
    }
    const entry = actionLog.getEntry(index);
    if (actionLog.hasPrevious()) {
      log.classList.add('hasPrevious');
    } else {
      log.classList.remove('hasPrevious');
    }
    if (!entry) return;
    let element = document.getElementById(`actionLogEntry${index}`);
    if (element) {
      entry.element = element;
      entry.updateElement();
    } else {
      element = entry.createElement();
      element.id = `actionLogEntry${index}`;
      element.style.order = index;

      const nextEntry = document.getElementById(`actionLogEntry${index + 1}`);
      log.insertBefore(element, nextEntry ?? document.getElementById('actionLogLatest'));
    }
    if ((actionLog.firstNewOrUpdatedEntry ?? Infinity) <= index) {
      element.classList.add('highlight');
      // this is just causing problems right now. disable, it's not all that important if scroll anchors work properly
      // element.scrollIntoView({block: "nearest", inline: "nearest", behavior: "auto"});
      setTimeout(() => element.classList.remove('highlight'), 1);
    }
  }

  mouseoverAction(index, isShowing) {
    if (isShowing) curActionShowing = index;
    else curActionShowing = undefined;
    const div = document.getElementById(`action${index}Selected`);
    if (div) {
      div.style.opacity = isShowing ? '1' : '0';
      document.getElementById(`actionTooltip${index}`).style.display = isShowing ? '' : 'none';
    }
    nextActionsDiv.style.display = isShowing ? 'none' : '';
    document.getElementById('actionTooltipContainer').style.display = isShowing ? '' : 'none';
    view.updateCurrentActionBar(index);
  }

  updateCurrentActionLoops(index) {
    const action = actions.current[index];
    if (action !== undefined) {
      document.getElementById(`action${index}LoopsDone`).textContent = (action.loops - action.loopsLeft) > 99999
        ? toSuffix(action.loops - action.loopsLeft)
        : formatNumber(action.loops - action.loopsLeft);
      document.getElementById(`action${index}Loops`).textContent = action.loops > 99999
        ? toSuffix(action.loops)
        : formatNumber(action.loops);
    }
  }

  updateProgressAction(
    { name: varName, town },
    level = town.getLevel(varName),
    levelPrc = `${town.getPrcToNext(varName)}%`,
  ) {
    document.getElementById(`prc${varName}`).textContent = `${level}`;
    document.getElementById(`expBar${varName}`)?.style.setProperty('width', levelPrc);
    document.getElementById(`progress${varName}`).textContent = intToString(levelPrc, 2);
    document.getElementById(`bar${varName}`).style.width = `${level}%`;
    if (varName.startsWith('Survey') && !varName.endsWith('Global')) {
      this.updateGlobalSurvey(varName, town);
    }
  }

  updateGlobalSurvey(varName, town) {
    const expToNext = getExploreExpToNextProgress();
    const expSinceLast = getExploreExpSinceLastProgress();
    this.updateProgressAction(
      { name: `${varName}Global`, town },
      getExploreProgress(),
      `${expSinceLast * 100 / (expSinceLast + expToNext)}%`,
    );
  }

  updateProgressActions() {
    for (const town of towns) {
      for (let i = 0; i < town.progressVars.length; i++) {
        const varName = town.progressVars[i];
        this.updateProgressAction({ name: varName, town: town });
      }
    }
  }

  updateLockedHidden() {
    for (const action of vals.totalActionList) {
      const actionDiv = document.getElementById(`container${action.varName}`);
      const infoDiv = document.getElementById(`infoContainer${action.varName}`);
      const storyDiv = document.getElementById(`storyContainer${action.varName}`);
      if (action.allowed && getNumOnList(action.name) >= action.allowed()) {
        actionDiv.classList.add('capped');
      } else if (action.unlocked()) {
        if (infoDiv) {
          infoDiv.classList.remove('hidden');
          if (action.varName.startsWith('Survey')) {
            document.getElementById(`infoContainer${action.varName}Global`).classList.remove('hidden');
          }
        }
        actionDiv.classList.remove('locked');
        actionDiv.classList.remove('capped');
      } else {
        actionDiv.classList.add('locked');
        if (infoDiv) {
          infoDiv.classList.add('hidden');
          if (action.varName.startsWith('Survey')) {
            document.getElementById(`infoContainer${action.varName}Global`).classList.add('hidden');
          }
        }
      }
      if (action.unlocked() && infoDiv) {
        infoDiv.classList.remove('hidden');
      }
      if (action.visible()) {
        actionDiv.classList.remove('hidden');
        if (storyDiv !== null) storyDiv.classList.remove('hidden');
      } else {
        actionDiv.classList.add('hidden');
        if (storyDiv !== null) storyDiv.classList.add('hidden');
      }
      if (storyDiv !== null) {
        if (action.unlocked()) {
          storyDiv.classList.remove('hidden');
        } else {
          storyDiv.classList.add('hidden');
        }
      }
    }
    if (
      vals.totalActionList.filter((action) => action.finish.toString().includes('handleSkillExp'))
        .filter((action) => action.unlocked()).length > 0
    ) {
      document.getElementById('skillList').style.display = '';
    } else {
      document.getElementById('skillList').style.display = 'none';
    }
    if (
      vals.totalActionList.filter((action) => action.finish.toString().includes('updateBuff')).filter(
          (action) => action.unlocked(),
        ).length > 0 ||
      prestigeValues['completedAnyPrestige']
    ) {
      document.getElementById('buffList').style.display = '';
    } else {
      document.getElementById('buffList').style.display = 'none';
    }
  }

  updateGlobalStory(num) {
    actionLog.addGlobalStory(num);
  }

  updateStories(init) {
    // several ms cost per run. run once every 2000ms on an interval
    for (const action of vals.totalActionList) {
      if (action.storyReqs !== undefined) {
        // greatly reduces/nullifies the cost of checking actions with all stories unlocked, which is nice,
        // since you're likely to have more stories unlocked at end game, which is when performance is worse
        const divName = `storyContainer${action.varName}`;
        if (init || document.getElementById(divName).innerHTML.includes('???')) {
          let storyTooltipText = '';
          let lastInBranch = false;
          let allStoriesForActionUnlocked = true;

          for (const { num: storyId, conditionHTML, text } of action.getStoryTexts()) {
            storyTooltipText += '<p>';
            if (action.storyReqs(storyId)) {
              storyTooltipText += conditionHTML + text;
              lastInBranch = false;
              if (
                action.visible() && action.unlocked() &&
                vals.completedActions.includes(action.varName)
              ) {
                actionLog.addActionStory(action, storyId, init);
              }
            } else {
              allStoriesForActionUnlocked = false;

              if (lastInBranch) {
                storyTooltipText += '<b>???:</b> ???';
              } else {
                storyTooltipText += `${conditionHTML} ???`;
                lastInBranch = true;
              }
            }
            storyTooltipText += '</p>\n';
          }

          if (document.getElementById(divName).children[2].innerHTML !== storyTooltipText) {
            document.getElementById(divName).children[2].innerHTML = storyTooltipText;
            if (!init) {
              showNotification(divName);
              if (!vals.unreadActionStories.includes(divName)) {
                vals.unreadActionStories.push(divName);
              }
            }
            if (allStoriesForActionUnlocked) {
              document.getElementById(divName).classList.add('storyContainerCompleted');
            } else {
              document.getElementById(divName).classList.remove('storyContainerCompleted');
            }
          }
        }
      }
    }
  }

  showTown(townNum) {
    if (!towns[townNum].unlocked()) return;

    if (townNum === 0) {
      document.getElementById('townViewLeft').style.visibility = 'hidden';
    } else {
      document.getElementById('townViewLeft').style.visibility = '';
    }

    if (townNum === Math.max(...vals.townsUnlocked)) {
      document.getElementById('townViewRight').style.visibility = 'hidden';
    } else {
      document.getElementById('townViewRight').style.visibility = '';
    }

    for (let i = 0; i < actionOptionsTown.length; i++) {
      actionOptionsTown[i].style.display = 'none';
      actionStoriesTown[i].style.display = 'none';
      townInfos[i].style.display = 'none';
    }
    if (vals.actionStoriesShowing) actionStoriesTown[townNum].style.display = '';
    else actionOptionsTown[townNum].style.display = '';
    townInfos[townNum].style.display = '';
    $('#TownSelect').val(townNum);

    document.getElementById('shortTownColumn').classList.remove(
      `zone-${vals.townshowing + 1}`,
    );
    document.getElementById('shortTownColumn').classList.add(`zone-${townNum + 1}`);
    document.getElementById('townDesc').textContent = Localization.txt(`towns>town${townNum}>desc`);
    vals.townshowing = townNum;
  }

  showActions(stories) {
    for (let i = 0; i < actionOptionsTown.length; i++) {
      actionOptionsTown[i].style.display = 'none';
      actionStoriesTown[i].style.display = 'none';
    }

    if (stories) {
      document.getElementById('actionsViewLeft').style.visibility = '';
      document.getElementById('actionsViewRight').style.visibility = 'hidden';
      actionStoriesTown[vals.townshowing].style.display = '';
    } else {
      document.getElementById('actionsViewLeft').style.visibility = 'hidden';
      document.getElementById('actionsViewRight').style.visibility = '';
      actionOptionsTown[vals.townshowing].style.display = '';
    }

    document.getElementById('actionsTitle').textContent = Localization.txt(
      `actions>title${stories ? '_stories' : ''}`,
    );
    vals.actionStoriesShowing = stories;
  }

  toggleHiding() {
    document.documentElement.classList.toggle('editing-hidden-vars');
  }

  toggleHidden(varName: string, force?: boolean) {
    const isHidden = towns[vals.townshowing].hiddenVars.has(varName);
    if ((isHidden && force !== true) || force === false) {
      towns[vals.townshowing].hiddenVars.delete(varName);
      document.getElementById(`infoContainer${varName}`).classList.remove('user-hidden');
    } else if (!isHidden || force === true) {
      towns[vals.townshowing].hiddenVars.add(varName);
      document.getElementById(`infoContainer${varName}`).classList.add('user-hidden');
    }
  }

  updateRegular(updateInfo) {
    const varName = updateInfo.name;
    const index = updateInfo.index;
    const town = towns[index];
    document.getElementById(`total${varName}`).textContent = String(town[`total${varName}`]);
    document.getElementById(`checked${varName}`).textContent = String(town[`checked${varName}`]);
    document.getElementById(`unchecked${varName}`).textContent = String(
      town[`total${varName}`] - town[`checked${varName}`],
    );
    document.getElementById(`goodTemp${varName}`).textContent = String(town[`goodTemp${varName}`]);
    document.getElementById(`good${varName}`).textContent = String(town[`good${varName}`]);
  }

  updateAddAmount(amount) {
    for (const elem of document.getElementsByClassName('change-amount')) {
      elem.classList.toggle('unused', elem.textContent !== String(amount));
    }
  }

  updateLoadout(num) {
    for (let i = 0; i < 16; i++) {
      const elem = document.getElementById(`load${i}`);
      if (elem) {
        elem.classList.add('unused');
      }
    }
    const elem = document.getElementById(`load${num}`);
    if (elem) {
      elem.classList.remove('unused');
    }
  }

  updateLoadoutNames() {
    for (let i = 0; i < vals.loadoutnames.length; i++) {
      document.getElementById(`load${i + 1}`).textContent = vals.loadoutnames[i];
    }
    document.getElementById('renameLoadout').value = vals.loadoutnames[vals.curLoadout - 1];
  }

  createTownActions() {
    if (actionOptionsTown[0].querySelector('.actionOrTravelContainer')) return;
    for (const action of towns.flatMap((t) => t.totalActionList)) {
      this.createTownAction(action);
    }
    for (const varName of towns.flatMap((t) => t.allVarNames)) {
      const action = vals.totalActionList.find((a) => a.varName === varName);
      if (isActionOfType(action, 'limited')) this.createTownInfo(action);
      if (isActionOfType(action, 'progress')) {
        if (action.name.startsWith('Survey')) this.createGlobalSurveyProgress(action);
        this.createActionProgress(action);
      }
      if (isActionOfType(action, 'multipart')) this.createMultiPartPBar(action);
    }
    if (vals.options.highlightNew) this.highlightIncompleteActions();
  }

  createGlobalSurveyProgress(action) {
    this.createActionProgress(action, 'Global', action.labelGlobal, true);
  }

  createActionProgress(action, varSuffix = '', label, includeExpBar = true) {
    const totalDivText = `<div class='townStatContainer showthat'>
            <div class='bold townLabel'>${label ?? action.labelDone}</div>
            <div class='progressValue' id='prc${action.varName}${varSuffix}'>5</div><div class='percentSign'>%</div>
            <div class='progressBars'>
                ${
      includeExpBar
        ? `<div class='thinProgressBarUpper'><div id='expBar${action.varName}${varSuffix}' class='statBar townExpBar'></div></div>`
        : ''
    }
                <div class='thinProgressBarLower'><div id='bar${action.varName}${varSuffix}' class='statBar townBar'></div></div>
            </div>

            <div class='showthis'>
                ${Localization.txt('actions>tooltip>higher_done_percent_benefic')}<br>
                <div class='bold'>${
      Localization.txt('actions>tooltip>progress_label')
    }</div><div id='progress${action.varName}${varSuffix}'></div>%
            </div>
            <div id='hideVarButton${action.varName}${varSuffix}' class='hideVarButton far'></div>
        </div>`;
    const progressDiv = document.createElement('div');
    progressDiv.className = 'townContainer progressType';
    progressDiv.id = `infoContainer${action.varName}${varSuffix}`;
    progressDiv.style.display = '';
    progressDiv.innerHTML = totalDivText;

    requestAnimationFrame(() => {
      const id = `${action.varName}${varSuffix}`;

      const hidevarButton = document.getElementById(`hideVarButton${id}`) as HTMLDivElement;
      hidevarButton.onclick = () => view.toggleHidden(id);
    });

    townInfos[action.townNum].appendChild(progressDiv);
    if (towns[action.townNum].hiddenVars.has(`${action.varName}${varSuffix}`)) {
      progressDiv.classList.add('user-hidden');
    }
  }

  createTownAction(action) {
    let actionStats = '';
    let actionSkills = '';
    let skillDetails = '';
    let lockedStats = '';
    let lockedSkills = '';
    const pieSlices = [];
    const gradientStops = [];
    const statEntries = Object.entries(action.stats);
    // sort high to low, then by statname index
    statEntries.sort((
      [aStat, aRatio],
      [bStat, bRatio],
    ) => ((bRatio - aRatio) ||
      (statList.indexOf(aStat) - statList.indexOf(bStat)))
    );
    let totalRatio = 0;
    let gradientOffset = 0;
    let lastArcPoint = [0, -1]; // start at 12 o'clock
    for (const [stat, ratio] of statEntries) {
      const statLabel = Localization.txt(`stats>${stat}>short_form`);
      actionStats += `<dt class='stat-${stat}'>${statLabel}</dt> <dd class='stat-${stat}'>${ratio * 100}%</dd>`;
      const startRatio = totalRatio;
      totalRatio += ratio;
      if (totalRatio >= 0.999 && totalRatio <= 1.001) totalRatio = 1;
      const midRatio = (startRatio + totalRatio) / 2;
      const angle = Math.PI * 2 * totalRatio;
      const arcPoint = [Math.sin(angle), -Math.cos(angle)];
      pieSlices.push(
        `<path class='pie-slice stat-${stat}' d='M0,0 L${lastArcPoint.join()} A1,1 0,${
          ratio >= 0.5 ? 1 : 0
        },1 ${arcPoint.join()} Z' />`,
      );
      if (gradientStops.length === 0) {
        gradientOffset = midRatio;
        gradientStops.push(
          `from ${gradientOffset}turn`,
          `var(--stat-${stat}-color) calc(${gradientOffset}turn * var(--pie-ratio))`,
        );
      } else {
        gradientStops.push(
          `var(--stat-${stat}-color) calc(${midRatio - gradientOffset}turn - (${
            ratio / 2
          }turn * var(--pie-ratio))) calc(${midRatio - gradientOffset}turn + (${ratio / 2}turn * var(--pie-ratio)))`,
        );
      }
      lastArcPoint = arcPoint;
    }
    // this is *almost* always true (but not always)
    if (statEntries.length > 0) {
      gradientStops.push(
        `var(--stat-${statEntries[0][0]}-color) calc(1turn - (${gradientOffset}turn * var(--pie-ratio)))`,
      );
      const highestRatio = statEntries[0][1];
      lockedStats = `(${
        statEntries.map((
          [stat, ratio],
        ) => [
          ratio === highestRatio,
          stat,
          Localization.txt(`stats>${stat}>short_form`),
        ])
          .map(([isHighestStat, stat, label]) =>
            `<span class='${isHighestStat ? 'bold' : ''} stat-${stat} stat-color'>${label}</span>`
          )
          .join(', ')
      })<br>`;
    }
    const statPie = statEntries.length === 0 ? '' : `
                <svg viewBox='-1 -1 2 2' class='stat-pie' id='stat-pie-${action.varName}'>
                    <g id='stat-pie-${action.varName}-g'>
                        ${pieSlices.join('')}
                    </g>
                </svg>
                <div class='stat-pie mask' style='background:conic-gradient(${gradientStops.join()})'></div>`;
    if (action.skills !== undefined) {
      const skillKeyNames = Object.keys(action.skills);
      const l = skillList.length;
      for (let i = 0; i < l; i++) {
        for (const skill of skillKeyNames) {
          if (skillList[i] === skill) {
            const xmlName = getXMLName(skill);
            const skillLabel = `${Localization.txt(`skills>${xmlName}>label`)} ${
              Localization.txt('stats>tooltip>exp')
            }`;
            actionSkills +=
              `<div class='bold'>${skillLabel}:</div><span id='expGain${action.varName}${skill}'></span><br>`;
            if (action.teachesSkill(skill)) {
              const learnSkill = `<div class='bold'>${Localization.txt('actions>tooltip>learn_skill')}:</div>`;
              lockedSkills += `${learnSkill} <span>${Localization.txt(`skills>${xmlName}>label`)}</span><br>`;
              skillDetails += `<hr>
                                ${learnSkill} <div class='bold underline'>${
                Localization.txt(`skills>${xmlName}>label`)
              }</div><br>
                                <i>${Localization.txt(`skills>${xmlName}>desc`)}</i><br>`;
              if (Localization.txtsObj(`skills>${xmlName}>desc2`)?.length > 0) {
                skillDetails += `${
                  Localization.txt(`skills>${xmlName}>desc2`).replace(/<br>\s*Currently.*(?:<br>|$)/sgi, '')
                }<br>`; // ugh
              }
            }
          }
        }
      }
    }
    if (isBuffName(action.grantsBuff)) {
      const xmlName = getXMLName(Buff.fullNames[action.grantsBuff]);
      const grantsBuff = `<div class='bold'>${Localization.txt('actions>tooltip>grants_buff')}:</div>`;
      lockedSkills += `${grantsBuff} <span>${Localization.txt(`buffs>${xmlName}>label`)}</span><br>`;
      skillDetails += `<hr>
                ${grantsBuff} <div class='bold underline'>${Localization.txt(`buffs>${xmlName}>label`)}</div><br>
                <i>${Localization.txt(`buffs>${xmlName}>desc`)}</i><br>`;
    }
    let extraImage = '';
    const extraImagePositions = [
      'margin-top:17px;margin-left:5px;',
      'margin-top:17px;margin-left:-55px;',
      'margin-top:0px;margin-left:-55px;',
      'margin-top:0px;margin-left:5px;',
    ];
    if (action.affectedBy) {
      for (let i = 0; i < action.affectedBy.length; i++) {
        extraImage += `<img src='icons/${
          camelize(action.affectedBy[i])
        }.svg' class='smallIcon' draggable='false' style='position:absolute;${extraImagePositions[i]}'>`;
      }
    }
    const isTravel = getTravelNum(action.name) != 0;
    const divClass = `${isTravel ? 'travelContainer' : 'actionContainer'} ${
      isTraining(action.name) || hasLimit(action.name) ? 'cappableActionContainer' : ''
    }`;
    const imageName = action.name.startsWith('Assassin') ? 'assassin' : camelize(action.name);
    const unlockConditions = /<br>\s*Unlocked (.*?)(?:<br>|$)/is.exec(
      `${action.tooltip}${action.goldCost === undefined ? '' : action.tooltip2}`,
    )?.[1]; // I hate this but wygd
    const lockedText = unlockConditions
      ? `${Localization.txt('actions>tooltip>locked_tooltip')}<br>Will unlock ${unlockConditions}`
      : `${action.tooltip}${action.goldCost === undefined ? '' : action.tooltip2}`;
    const totalDivText = `<button
                id='container${action.varName}'
                class='${divClass} actionOrTravelContainer ${action.type}ActionContainer showthat'
                draggable='true'
            >
                <label>${action.label}</label><br>
                <div style='position:relative'>
                    <img src='icons/${imageName}.svg' class='superLargeIcon' draggable='false'>${extraImage}
                </div>
                ${statPie}
                <div class='showthis when-unlocked' draggable='false'>
                    ${action.tooltip}<span id='goldCost${action.varName}'></span>
                    ${(action.goldCost === undefined) ? '' : action.tooltip2}
                    <br>
                    ${actionSkills}
                    <div class='bold'>${
      Localization.txt('actions>tooltip>mana_cost')
    }:</div> <div id='manaCost${action.varName}'>${formatNumber(action.manaCost())}</div><br>
                    <dl class='action-stats'>${actionStats}</dl>
                    <div class='bold'>${
      Localization.txt('actions>tooltip>exp_multiplier')
    }:</div><div id='expMult${action.varName}'>${action.expMult * 100}</div>%<br>
                    ${skillDetails}
                </div>
                <div class='showthis when-locked' draggable='false'>
                    ${lockedText}
                    <br>
                    ${lockedSkills}
                    ${lockedStats}
                </div>
            </button>`;

    const actionsDiv = document.createElement('div');
    actionsDiv.innerHTML = totalDivText;

    requestAnimationFrame(() => {
      const container = document.getElementById(`container${action.varName}`) as HTMLButtonElement;

      container.ondragover = () => handleDragOver(event);
      container.ondragstart = () =>
        handleDirectActionDragStart(event, action.name, action.townNum, action.varName, false);
      container.ondragend = () => handleDirectActionDragEnd(action.varName);
      container.onclick = () => addActionToList(action.name, action.townNum);
      container.onmouseover = () => view.updateAction(action.varName);
      container.onmouseout = () => view.updateAction(undefined);
    });

    actionOptionsTown[action.townNum].querySelector(`:scope > .${isTravel ? 'travelDiv' : 'actionDiv'}`).appendChild(
      actionsDiv,
    );

    if (action.storyReqs !== undefined) {
      let storyTooltipText = '';
      let lastInBranch = false;

      for (const { num: storyId, conditionHTML, text } of action.getStoryTexts()) {
        storyTooltipText += '<p>';
        if (action.storyReqs(storyId)) {
          storyTooltipText += conditionHTML + text;
          lastInBranch = false;
        } else if (lastInBranch) {
          storyTooltipText += '<b>???:</b> ???';
        } else {
          storyTooltipText += `${conditionHTML} ???`;
          lastInBranch = true;
        }
        storyTooltipText += '</p>';
      }

      const storyDivText =
        `<div id='storyContainer${action.varName}' tabindex='0' class='storyContainer showthatstory' draggable='false'>${action.label}
                    <br>
                    <div style='position:relative'>
                        <img src='icons/${camelize(action.name)}.svg' class='superLargeIcon' draggable='false'>
                        <div id='storyContainer${action.varName}Notification' class='notification storyNotification'></div>
                    </div>
                    <div class='showthisstory' draggable='false'>
                        ${storyTooltipText}
                    </div>
                </div>`;

      const storyDiv = document.createElement('div');
      storyDiv.innerHTML = storyDivText;

      requestAnimationFrame(() => {
        const container = document.getElementById(`storyContainer${action.varName}`) as HTMLDivElement;
        container.onmouseover = () => hideNotification(`storyContainer${action.varName}`);
      });

      actionStoriesTown[action.townNum].appendChild(storyDiv);
    }
  }

  updateAction(action) {
    if (action === undefined) return;
    let container = document.getElementById(`container${action}`);
    this.adjustTooltipPosition(container.querySelector('div.showthis'));
  }

  adjustManaCost(actionName) {
    const action = translateClassNames(actionName);
    document.getElementById(`manaCost${action.varName}`).textContent = formatNumber(
      action.manaCost(),
    );
  }

  adjustExpMult(actionName) {
    const action = translateClassNames(actionName);
    document.getElementById(`expMult${action.varName}`).textContent = formatNumber(
      action.expMult * 100,
    );
  }

  goldCosts = {};

  adjustGoldCost(updateInfo) {
    const varName = updateInfo.varName;
    const amount = updateInfo.cost;
    const element = document.getElementById(`goldCost${varName}`);
    if (this.goldCosts[varName] !== amount && element) {
      element.textContent = formatNumber(amount);
      this.goldCosts[varName] = amount;
    }
  }
  adjustGoldCosts() {
    for (const action of actionsWithGoldCost) {
      this.adjustGoldCost({ varName: action.varName, cost: action.goldCost() });
    }
  }
  adjustExpGain(action) {
    for (const skill in action.skills) {
      if (Number.isInteger(action.skills[skill])) {
        document.getElementById(`expGain${action.varName}${skill}`).textContent = ` ${action.skills[skill].toFixed(0)}`;
      } else {document.getElementById(`expGain${action.varName}${skill}`).textContent = ` ${
          action.skills[skill]().toFixed(0)
        }`;}
    }
  }
  adjustExpGains() {
    for (const action of vals.totalActionList) {
      if (action.skills) this.adjustExpGain(action);
    }
  }

  createTownInfo(action) {
    const totalInfoText = `
            <div class='townInfoContainer showthat'>
                <div class='bold townLabel'>${action.labelDone}</div>
                <div class='numeric goodTemp' id='goodTemp${action.varName}'>0</div> <i class='fa fa-arrow-left'></i>
                <div class='numeric good' id='good${action.varName}'>0</div> <i class='fa fa-arrow-left'></i>
                <div class='numeric unchecked' id='unchecked${action.varName}'>0</div>
                <input type='checkbox' id='searchToggler${action.varName}' style='margin-left:10px;'>
                <label for='searchToggler${action.varName}'> Lootable first</label>
                <div class='showthis'>${action.infoText()}</div>
                <div id='hideVarButton${action.varName}' class='hideVarButton far'></div>
            </div><br>
    `;

    const infoDiv = document.createElement('div');
    infoDiv.className = 'townContainer infoType';
    infoDiv.id = `infoContainer${action.varName}`;
    infoDiv.style.display = '';
    infoDiv.innerHTML = totalInfoText;

    requestAnimationFrame(() => {
      const hidevarButton = document.getElementById(`hideVarButton${action.varName}`) as HTMLDivElement;

      hidevarButton.onclick = () => view.toggleHidden(`${action.varName}`);
    });

    townInfos[action.townNum].appendChild(infoDiv);
    if (towns[action.townNum].hiddenVars.has(action.varName)) {
      infoDiv.classList.add('user-hidden');
    }
  }

  createMultiPartPBar(action) {
    let pbars = '';
    const width = `style='width:calc(${91 / action.segments}% - 4px)'`;
    const varName = action.varName;
    for (let i = 0; i < action.segments; i++) {
      pbars += `<div class='thickProgressBar showthat' ${width}>
                        <div id='expBar${i}${varName}' class='segmentBar'></div>
                        <div class='showthis' id='tooltip${i}${varName}'>
                            <div id='segmentName${i}${varName}'></div><br>
                            <div class='bold'>Main Stat</div> <div id='mainStat${i}${varName}'></div><br>
                            <div class='bold'>Progress</div> <div id='progress${i}${varName}'></div> / <div id='progressNeeded${i}${varName}'></div>
                        </div>
                    </div>`;
    }
    const completedTooltip = action.completedTooltip ? action.completedTooltip() : '';

    const totalDivText = `
            <div class='townStatContainer' id='infoContainer${varName}'>
                <div class='multipartLabel'>
                    <div class='flexMargin'></div>
                    <div class='bold townLabel' id='multiPartName${varName}'></div>
                    <div id='completedInfo${varName}' class='completedInfo showthat'>
                        <div class='bold'>${action.labelDone}</div>
                        <div id='completed${varName}'></div>
                        ${
      completedTooltip === '' ? '' : `<div class='showthis' id='completedContainer${varName}'>
                            ${completedTooltip}
                        </div>`
    }
                    </div>
                    <div class='flexMargin'></div>
                </div>
                <div class='multipartBars'>
                    ${pbars}
                </div>
                <div id='hideVarButton${action.varName}' class='hideVarButton far'></div>
            </div>`;

    const progressDiv = document.createElement('div');
    progressDiv.className = 'townContainer multipartType';
    progressDiv.style.display = '';
    progressDiv.innerHTML = totalDivText;

    requestAnimationFrame(() => {
      const hidevarButton = document.getElementById(`hideVarButton${action.varName}`) as HTMLDivElement;
      hidevarButton.onclick = () => view.toggleHidden(`${action.varName}`);

      const completedInfo = document.getElementById(`completedInfo${action.varName}`) as HTMLDivElement;
      if (action.varName === 'SDungeon') {
        completedInfo.onmouseover = () => view.showDungeon(0);
        completedInfo.onmouseout = () => view.showDungeon(undefined);
      } else if (action.varName === 'LDungeon') {
        completedInfo.onmouseover = () => view.showDungeon(1);
        completedInfo.onmouseout = () => view.showDungeon(undefined);
      } else if (action.varName === 'TheSpire') {
        completedInfo.onmouseover = () => view.showDungeon(2);
        completedInfo.onmouseout = () => view.showDungeon(undefined);
      }
    });

    townInfos[action.townNum].appendChild(progressDiv);
    if (towns[action.townNum].hiddenVars.has(action.varName)) {
      progressDiv.firstElementChild.classList.add('user-hidden');
    }
  }

  updateMultiPartActions() {
    for (const action of vals.totalActionList) {
      if (action.type === 'multipart') {
        this.updateMultiPart(action);
        this.updateMultiPartSegments(action);
      }
    }
  }

  updateMultiPartSegments(action) {
    let segment = 0;
    let curProgress = towns[action.townNum][action.varName];
    // update previous segments
    let loopCost = action.loopCost(segment);
    while (curProgress >= loopCost && segment < action.segments) {
      document.getElementById(`expBar${segment}${action.varName}`).style.width = '0px';
      const roundedLoopCost = intToStringRound(loopCost);
      if (document.getElementById(`progress${segment}${action.varName}`).textContent !== roundedLoopCost) {
        document.getElementById(`progress${segment}${action.varName}`).textContent = roundedLoopCost;
        document.getElementById(`progressNeeded${segment}${action.varName}`).textContent = roundedLoopCost;
      }

      curProgress -= loopCost;
      segment++;
      loopCost = action.loopCost(segment);
    }

    // update current segments
    if (document.getElementById(`progress${segment}${action.varName}`)) {
      document.getElementById(`expBar${segment}${action.varName}`).style.width = `${
        100 - 100 * curProgress / loopCost
      }%`;
      document.getElementById(`progress${segment}${action.varName}`).textContent = intToStringRound(
        curProgress,
      );
      document.getElementById(`progressNeeded${segment}${action.varName}`).textContent = intToStringRound(loopCost);
    }

    // update later segments
    for (let i = segment + 1; i < action.segments; i++) {
      document.getElementById(`expBar${i}${action.varName}`).style.width = '100%';
      if (document.getElementById(`progress${i}${action.varName}`).textContent !== '0') {
        document.getElementById(`progress${i}${action.varName}`).textContent = '0';
      }
      document.getElementById(`progressNeeded${i}${action.varName}`).textContent = intToStringRound(
        action.loopCost(i),
      );
    }
  }

  showDungeon(index) {
    dungeonShowing = index;
    if (index !== undefined) this.updateSoulstoneChance(index);
  }

  updateSoulstoneChance(index) {
    const dungeon = vals.dungeons[index];
    for (let i = 0; i < dungeon.length; i++) {
      const level = dungeon[i];
      document.getElementById(`soulstoneChance${index}_${i}`).textContent = intToString(
        level.ssChance * 100,
        4,
      );
      document.getElementById(`soulstonePrevious${index}_${i}`).textContent = level.lastStat;
      document.getElementById(`soulstoneCompleted${index}_${i}`).textContent = formatNumber(
        level.completed,
      );
    }
  }

  updateTrials() {
    for (let i = 0; i < vals.trials.length; i++) {
      this.updateTrialInfo({ trialNum: i, curFloor: 0 });
    }
  }

  updateTrialInfo(updateInfo) {
    const curFloor = updateInfo.curFloor;
    const trialNum = updateInfo.trialNum;
    const trial = vals.trials[trialNum];
    document.getElementById(`trial${trialNum}HighestFloor`).textContent = String(trial.highestFloor + 1);
    if (curFloor >= trial.length) {
      document.getElementById(`trial${trialNum}CurFloor`).textContent = '';
      document.getElementById(`trial${trialNum}CurFloorCompleted`).textContent = '';
    } else {
      document.getElementById(`trial${trialNum}CurFloor`).textContent = '' + (curFloor + 1);
      document.getElementById(`trial${trialNum}CurFloorCompleted`).textContent = trial[curFloor].completed;
    }
    if (curFloor > 0) {
      document.getElementById(`trial${trialNum}LastFloor`).textContent = curFloor;
      document.getElementById(`trial${trialNum}LastFloorCompleted`).textContent = trial[curFloor - 1].completed;
    }
  }

  updateSoulstones() {
    let total = 0;
    for (const stat of statList) {
      if (stats[stat].soulstone) {
        total += stats[stat].soulstone;
        document.getElementById(`stat${stat}SoulstoneLogBar`).parentElement.style.display = '';
        this.updateLevelLogBar(
          'statsContainer',
          `stat${stat}SoulstoneLogBar`,
          stats[stat].soulstone,
        );
        document.getElementById(`ss${stat}Container`).style.display = '';
        document.getElementById(`ss${stat}`).textContent = formatNumber(
          stats[stat].soulstone,
        );
        document.getElementById(`stat${stat}SSBonus`).textContent = intToString(
          stats[stat].soulstone ? stats[stat].soulstoneMult : 0,
        );
        document.getElementById(`stat${stat}ss`).textContent = intToString(
          stats[stat].soulstone,
          1,
        );
      } else {
        document.getElementById(`stat${stat}SoulstoneLogBar`).parentElement.style.display = 'none';
        document.getElementById(`ss${stat}Container`).style.display = 'none';
        document.getElementById(`stat${stat}ss`).textContent = '';
      }
    }
    if (total > 0) {
      document.getElementById(`stattotalss`).style.display = '';
      document.getElementById(`stattotalss`).textContent = intToString(total, 1);
      document.getElementById(`sstotalContainer`).style.display = '';
      document.getElementById(`sstotal`).textContent = formatNumber(total);
    } else {
      document.getElementById(`stattotalss`).style.display = 'none';
      document.getElementById(`stattotalss`).textContent = '';
      document.getElementById(`sstotalContainer`).style.display = 'none';
    }
  }

  updateMultiPart(action) {
    const town = towns[action.townNum];
    document.getElementById(`multiPartName${action.varName}`).textContent = action.getPartName();
    document.getElementById(`completed${action.varName}`).textContent = ` ${
      formatNumber(town[`total${action.varName}`])
    }`;
    for (let i = 0; i < action.segments; i++) {
      const expBar = document.getElementById(`expBar${i}${action.varName}`);
      if (!expBar) {
        continue;
      }
      const mainStat = action.loopStats[(town[`${action.varName}LoopCounter`] + i) % action.loopStats.length];
      document.getElementById(`mainStat${i}${action.varName}`).textContent = Localization.txt(
        `stats>${mainStat}>short_form`,
      );
      addStatColors(expBar, mainStat, true);
      document.getElementById(`segmentName${i}${action.varName}`).textContent = action.getSegmentName(
        town[`${action.varName}LoopCounter`] + i,
      );
    }
  }

  updateTrainingLimits() {
    for (let i = 0; i < statList.length; i++) {
      const trainingDiv = document.getElementById(`trainingLimit${statList[i]}`);
      if (trainingDiv) {
        trainingDiv.textContent = String(vals.trainingLimits);
      }
    }
    if (getBuffLevel('Imbuement') > 0 || getBuffLevel('Imbuement3') > 0) {
      document.getElementById('maxTraining').style.display = '';
    }
  }

  // when you mouseover Story
  updateStory(num) {
    document.getElementById('newStory').style.display = 'none';
    if (num <= 0) {
      num = 0;
      document.getElementById('storyLeft').style.visibility = 'hidden';
    } else {
      document.getElementById('storyLeft').style.visibility = '';
    }

    if (num >= vals.storyMax) {
      num = vals.storyMax;
      document.getElementById('storyRight').style.visibility = 'hidden';
    } else {
      document.getElementById('storyRight').style.visibility = '';
    }
    //Hard coded story count - need to fix this
    for (let i = 0; i <= 12; i++) {
      const storyDiv = document.getElementById(`story${i}`);
      if (storyDiv) {
        storyDiv.style.display = 'none';
      }
    }
    vals.storyShowing = num;
    document.getElementById('storyPage').textContent = String(vals.storyShowing + 1);
    document.getElementById(`story${num}`).style.display = 'inline-block';
  }

  changeStatView() {
    const statsWindow = document.getElementById('statsWindow');
    if (document.getElementById('regularStats').checked) {
      statsWindow.dataset.view = 'regular';
    } else {
      statsWindow.dataset.view = 'radar';
      this.statGraph.update();
    }
  }

  createTravelMenu() {
    let travelMenu = $('#TownSelect');
    travelMenu.empty();
    townNames.forEach((town, index) => {
      travelMenu.append(`"<option value=${index} class='zone-${index + 1}' hidden=''>${town}</option>`);
    });
    travelMenu.change(function () {
      view.showTown(Number($(this).val()));
    });
    this.updateTravelMenu();
  }

  updateTravelMenu() {
    let travelOptions = $('#TownSelect').children();
    for (let i = 0; i < travelOptions.length; i++) {
      travelOptions[i].hidden = !vals.townsUnlocked.includes(i);
    }
  }

  adjustDarkRitualText() {
    let DRdesc = document.getElementById('DRText');
    DRdesc.innerHTML = `Actions are:<br>`;
    vals.townsUnlocked.forEach((townNum) => {
      DRdesc.innerHTML += DarkRitualDescription[townNum];
    });
    if (getBuffLevel('Ritual') > 200) DRdesc.innerHTML += DarkRitualDescription[9];
  }

  highlightIncompleteActions() {
    let actionDivs = Array.from(document.getElementsByClassName('actionContainer'));
    actionDivs.forEach((div) => {
      let actionName = div.id.replace('container', '');
      if (!vals.completedActions.includes(actionName)) {
        div.classList.add('actionHighlight');
      }
    });
  }

  removeAllHighlights() {
    let actionDivs = Array.from(document.getElementsByClassName('actionHighlight'));
    actionDivs.forEach((div) => {
      div.classList.remove('actionHighlight');
    });
  }

  updateTotals() {
    document.getElementById('borrowedTimeDays').textContent = `${
      formatNumber(Math.floor(vals.totals.borrowedTime / 86400))
    }${Localization.txt('time_controls>days')}`;
  }

  updatePrestigeValues() {
    document.getElementById('currentPrestigePoints').textContent = `${
      formatNumber(prestigeValues['prestigeCurrentPoints'])
    }`;
    document.getElementById('currentPrestigesCompleted').textContent = `${
      formatNumber(prestigeValues['prestigeTotalCompletions'])
    }`;
    document.getElementById('maxTotalImbueSoulLevels').textContent = `${
      formatNumber(Math.min(prestigeValues['prestigeTotalCompletions'], 7))
    }`;

    document.getElementById('totalPrestigePoints').textContent = `${
      formatNumber(prestigeValues['prestigeTotalPoints'])
    }`;

    document.getElementById('prestigePhysicalCurrentBonus').textContent = `${
      formatNumber(getPrestigeCurrentBonus('PrestigePhysical'))
    }`;
    document.getElementById('prestigeMentalCurrentBonus').textContent = `${
      formatNumber(getPrestigeCurrentBonus('PrestigeMental'))
    }`;
    document.getElementById('prestigeCombatCurrentBonus').textContent = `${
      formatNumber(getPrestigeCurrentBonus('PrestigeCombat'))
    }`;
    document.getElementById('prestigeSpatiomancyCurrentBonus').textContent = `${
      formatNumber(getPrestigeCurrentBonus('PrestigeSpatiomancy'))
    }`;
    document.getElementById('prestigeChronomancyCurrentBonus').textContent = `${
      formatNumber(getPrestigeCurrentBonus('PrestigeChronomancy'))
    }`;
    document.getElementById('prestigeBarteringCurrentBonus').textContent = `${
      formatNumber(getPrestigeCurrentBonus('PrestigeBartering'))
    }`;
    document.getElementById('prestigeExpOverflowCurrentBonus').textContent = `${
      formatNumber(getPrestigeCurrentBonus('PrestigeExpOverflow') * 10)
    }`;

    document.getElementById('prestigePhysicalNextCost').textContent = `${
      formatNumber(getPrestigeCost('PrestigePhysical'))
    }`;
    document.getElementById('prestigeMentalNextCost').textContent = `${
      formatNumber(getPrestigeCost('PrestigeMental'))
    }`;
    document.getElementById('prestigeCombatNextCost').textContent = `${
      formatNumber(getPrestigeCost('PrestigeCombat'))
    }`;
    document.getElementById('prestigeSpatiomancyNextCost').textContent = `${
      formatNumber(getPrestigeCost('PrestigeSpatiomancy'))
    }`;
    document.getElementById('prestigeChronomancyNextCost').textContent = `${
      formatNumber(getPrestigeCost('PrestigeChronomancy'))
    }`;
    document.getElementById('prestigeBarteringNextCost').textContent = `${
      formatNumber(getPrestigeCost('PrestigeBartering'))
    }`;
    document.getElementById('prestigeExpOverflowNextCost').textContent = `${
      formatNumber(getPrestigeCost('PrestigeExpOverflow'))
    }`;
  }
}

export function unlockGlobalStory(num) {
  if (num > vals.storyMax) {
    document.getElementById('newStory').style.display = 'inline-block';
    vals.storyMax = num;
    view.requestUpdate('updateGlobalStory', num);
  }
}

export function setStoryFlag(name) {
  if (!storyFlags[name]) {
    storyFlags[name] = true;
    if (vals.options.actionLog) view.requestUpdate('updateStories', false);
  }
}
const unlockStory = setStoryFlag; // compatibility alias

export function increaseStoryVarTo(name, value) {
  if (storyVars[name] < value) {
    storyVars[name] = value;
    if (vals.options.actionLog) view.requestUpdate('updateStories', false);
  }
}

export function scrollToPanel(event, target) {
  event.preventDefault();
  const element = document.getElementById(target);
  const main = document.getElementById('main');

  if (element instanceof HTMLElement && main) {
    main.scroll({
      behavior: 'smooth',
      left: element.offsetLeft,
    });
  }

  return false;
}

export function addStatColors(theDiv, stat, forceColors = false) {
  for (const className of Array.from(theDiv.classList)) {
    if (className.startsWith('stat-') && className.slice(5) in stats) {
      theDiv.classList.remove(className);
    }
  }
  theDiv.classList.add(`stat-${stat}`, 'stat-background');
  if (forceColors) {
    theDiv.classList.add('use-stat-colors');
  }
}

export function dragOverDecorate(i) {
  if (document.getElementById(`nextActionContainer${i}`)) {
    document.getElementById(`nextActionContainer${i}`).classList.add('draggedOverAction');
  }
}

export function dragExitUndecorate(i) {
  if (document.getElementById(`nextActionContainer${i}`)) {
    document.getElementById(`nextActionContainer${i}`).classList.remove('draggedOverAction');
  }
}

export function draggedDecorate(i) {
  if (document.getElementById(`nextActionContainer${i}`)) {
    document.getElementById(`nextActionContainer${i}`).classList.add('draggedAction');
  }
}

export function draggedUndecorate(i) {
  if (document.getElementById(`nextActionContainer${i}`)) {
    document.getElementById(`nextActionContainer${i}`).classList.remove('draggedAction');
  }
  showActionIcons();
}

export function updateBuffCaps() {
  for (const buff of buffList) {
    document.getElementById(`buff${buff}Cap`).value = String(
      Math.min(
        parseInt(document.getElementById(`buff${buff}Cap`).value),
        buffHardCaps[buff],
      ),
    );
    buffCaps[buff] = parseInt(document.getElementById(`buff${buff}Cap`).value);
  }
}

export const view = new View();
