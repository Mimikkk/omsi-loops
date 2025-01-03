export class LevelExp {
  level = 0;
  exp = 0;

  static expRequiredForLevel(level) {
    return level * 100;
  }
  static totalExpForLevel(level) {
    return level * (level + 1) * 50;
  }
  static levelForTotalExp(totalExp) {
    return Math.max(Math.floor((Math.sqrt(8 * totalExp / 100 + 1) - 1) / 2), 0);
  }

  get expToNextLevel() {
    return this.expRequiredForNextLevel - this.exp;
  }

  #expRequiredForNextLevel;
  get expRequiredForNextLevel() {
    return this.#expRequiredForNextLevel ??= LevelExp.expRequiredForLevel(this.level + 1);
  }

  #totalExpForThisLevel;
  get totalExpForThisLevel() {
    return this.#totalExpForThisLevel ??= LevelExp.totalExpForLevel(this.level);
  }

  get totalExp() {
    return this.totalExpForThisLevel + this.exp;
  }

  set totalExp(totalExp) {
    this.level = LevelExp.levelForTotalExp(totalExp);
    this.exp = 0;
    this.exp = totalExp - this.totalExp;
  }

  constructor(levelOrTotalExp, exp) {
    if (typeof levelOrTotalExp === 'number') {
      if (typeof exp === 'number') {
        this.level = levelOrTotalExp;
        this.exp = exp;
      } else {
        this.totalExp = levelOrTotalExp;
      }
    }
  }

  recalc() {
    this.#expRequiredForNextLevel = this.#totalExpForThisLevel = undefined;
  }

  setLevel(level, exp = 0) {
    this.level = level;
    this.exp = exp;
    this.recalc();
  }

  levelUp() {
    while (this.exp >= this.expRequiredForNextLevel) {
      this.exp -= this.expRequiredForNextLevel;
      this.level++;
      this.recalc();
    }
    while (this.exp < 0 && this.level > 0) {
      this.level--;
      this.exp += this.expRequiredForNextLevel;
      this.recalc();
    }
  }

  addExp(exp) {
    this.exp += exp;
    this.levelUp();
  }

  load(toLoad, totalExp) {
    if (!toLoad || typeof toLoad !== 'object') toLoad = {};
    if (toLoad.level >= 0 && toLoad.exp >= 0) {
      this.level = toLoad.level;
      this.exp = toLoad.exp;
    } else if (totalExp > 0) {
      this.totalExp = totalExp;
    } else {
      this.level = this.exp = 0;
    }
    this.recalc();
  }
}

class Localizable2 {
  #txtsObj;
  #rootPath;
  #lib;

  get rootPath() {
    return this.#rootPath;
  }
  get lib() {
    return this.#lib;
  }
  get txtsObj() {
    return this.#txtsObj ??= globalThis.Localization.txtsObj(this.#rootPath, this.#lib);
  }

  constructor(rootPath, lib) {
    this.#rootPath = rootPath;
    this.#lib = lib;
  }

  memoize(property, subPath = `>${property}`) {
    let value = this.txtsObj.find(subPath).text();
    if (!value) value = globalThis.Localization.txt(this.#rootPath + subPath, this.#lib);

    Object.defineProperty(this, property, { value, configurable: true });

    return value;
  }
}

export class Stat extends Localizable2 {
  name;
  statLevelExp = new LevelExp();
  talentLevelExp = new LevelExp();
  soullessLevelExp = new LevelExp();
  soulstone = 0;

  prestigeBuff;

  constructor(name) {
    super(`stats>${name}`);
    Object.defineProperty(this, 'name', { value: name });
    if (['Str', 'Dex', 'Con', 'Spd', 'Per'].includes(name)) {
      this.prestigeBuff = 'PrestigePhysical';
    }
    if (['Cha', 'Int', 'Soul', 'Luck'].includes(name)) {
      this.prestigeBuff = 'PrestigeMental';
    }
  }

  get exp() {
    return this.statLevelExp.totalExp;
  }
  set exp(totalExp) {
    throw new Error(`Tried to set stat.exp to ${totalExp}, should set stat.statLevelExp.totalExp instead`);
    // this.statLevelExp.totalExp = totalExp;
  }

  get talent() {
    return this.talentLevelExp.totalExp;
  }
  set talent(totalExp) {
    throw new Error(`Tried to set stat.talent to ${totalExp}, should set stat.talentLevelExp.totalExp instead`);
    // this.talentLevelExp.totalExp = totalExp;
  }

  get blurb() {
    return this.memoize('blurb', '>blurb');
  }

  get short_form() {
    return this.memoize('short_form', '>short_form');
  }

  get long_form() {
    return this.memoize('long_form', '>long_form');
  }

  #soulstoneCalc;
  #soulstoneMult;
  get soulstoneMult() {
    if (this.#soulstoneCalc !== this.soulstone) {
      this.#soulstoneMult = 1 + Math.pow(this.soulstone, 0.8) / 30;
      this.#soulstoneCalc = this.soulstone;
    }
    return this.#soulstoneMult;
  }

  #talentCalc;
  #talentMult;
  get talentMult() {
    if (this.#talentCalc !== this.talentLevelExp.level) {
      this.#talentMult = 1 + Math.pow(this.talentLevelExp.level, 0.4) / 3;
      this.#talentCalc = this.talentLevelExp.level;
    }
    return this.#talentMult;
  }

  #levelCalc;
  #effortMultiplier;
  #manaMultiplier;
  get effortMultiplier() {
    if (this.#levelCalc !== this.statLevelExp.level) {
      this.#effortMultiplier = 1 + this.statLevelExp.level / 100;
      this.#manaMultiplier = undefined;
      this.#levelCalc = this.statLevelExp.level;
    }
    return this.#effortMultiplier;
  }
  get manaMultiplier() {
    if (this.#levelCalc !== this.statLevelExp.level || this.#manaMultiplier === undefined) {
      this.#manaMultiplier = 1 / this.effortMultiplier; // will set levelCalc
    }
    return this.#manaMultiplier;
  }

  #tbxTalent;
  #tbxSoulstone;
  #tbxPrestige;
  #totalBonusXP;
  get totalBonusXP() {
    const prestigeLevel = getBuffLevel(this.prestigeBuff);
    if (
      this.#tbxSoulstone !== this.soulstone || this.#tbxTalent !== this.talentLevelExp.level ||
      this.#tbxPrestige !== prestigeLevel
    ) {
      this.#tbxSoulstone = this.soulstone;
      this.#tbxTalent = this.talentLevelExp.level;
      this.#tbxPrestige = prestigeLevel;
      this.#totalBonusXP = this.soulstoneMult * this.talentMult * globalThis.prestige.prestigeBonus(this.prestigeBuff);
    }
    return this.#totalBonusXP;
  }

  toJSON() {
    const toSave = { ...this };
    // Backwards compatibility
    toSave.exp = this.exp;
    toSave.talent = this.talent;
    return toSave;
  }

  load(toLoad) {
    if (!toLoad || typeof toLoad !== 'object') return false;
    // stat level doesn't get touched during load bc no saving partial loops yet
    // this.statLevelExp.load(toLoad.statLevelExp, toLoad.exp);
    this.talentLevelExp.load(toLoad.talentLevelExp, toLoad.talent);
    this.soulstone = toLoad.soulstone > 0 ? toLoad.soulstone : 0;
    return true;
  }

  static compareLevelAscending(a, b) {
    return a.exp - b.exp;
  }

  static compareLevelDescending(a, b) {
    return b.exp - a.exp;
  }

  static compareTalentAscending(a, b) {
    return a.talent - b.talent;
  }

  static compareTalentDescending(a, b) {
    return b.talent - a.talent;
  }

  static compareSoulstoneAscending(a, b) {
    return a.soulstone - b.soulstone;
  }

  static compareSoulstoneDescending(a, b) {
    return b.soulstone - a.soulstone;
  }
}

const Skill_increase = 1;
const Skill_decrease = 2;
const Skill_custom = 3;

export class Skill extends Localizable2 {
  name;
  levelExp = new LevelExp();

  change = 0;

  constructor(name) {
    super(`skills>${name}`);
    Object.defineProperty(this, 'name', { value: name });
  }

  get exp() {
    return this.levelExp.totalExp;
  }
  set exp(totalExp) {
    throw new Error(`Tried to set skill.exp to ${totalExp}, should set skill.levelExp.totalExp instead`);
    // this.levelExp.totalExp = totalExp;
  }

  get label() {
    return this.memoize('label', '>label');
  }
  get desc() {
    return this.memoize('desc', '>desc');
  }
  get desc2() {
    return this.memoize('desc2', '>desc2');
  }

  toJSON() {
    const toSave = { ...this };
    toSave.exp = this.exp;
    return toSave;
  }

  load(toLoad) {
    if (!toLoad || typeof toLoad !== 'object') return false;
    this.levelExp.load(toLoad.statLevelExp, toLoad.exp);
  }

  #bonusCalc;

  #bonus;
  getBonus() {
    if (this.#bonusCalc !== this.levelExp.level) {
      this.#bonus = (this.change === Skill_increase)
        ? Math.pow(1 + this.levelExp.level / 60, 0.25)
        : (this.change === Skill_decrease)
        ? 1 / (1 + this.levelExp.level / 100)
        : (this.change === Skill_custom)
        ? 1 / (1 + this.levelExp.level / 2000)
        : 0;
      this.#bonusCalc = this.levelExp.level;
    }
    return this.#bonus;
  }
}

export class Buff extends Localizable2 {
  static fullNames = ({
    Ritual: 'Dark Ritual',
    Imbuement: 'Imbue Mind',
    Imbuement2: 'Imbue Body',
    Feast: 'Great Feast',
    Aspirant: 'Aspirant',
    Heroism: 'Heroism',
    Imbuement3: 'Imbue Soul',
    PrestigePhysical: 'Prestige - Physical',
    PrestigeMental: 'Prestige - Mental',
    PrestigeCombat: 'Prestige - Combat',
    PrestigeSpatiomancy: 'Prestige - Spatiomancy',
    PrestigeChronomancy: 'Prestige - Chronomancy',
    PrestigeBartering: 'Prestige - Bartering',
    PrestigeExpOverflow: 'Prestige - Experience Overflow',
  });

  name;
  amt = 0;

  get label() {
    return this.memoize('label', '>label');
  }
  get desc() {
    return this.memoize('desc', '>desc');
  }

  constructor(name) {
    super(`buffs>${globalThis.actionList.getXMLName(globalThis.stats.Buff.fullNames[name])}`);

    Object.defineProperty(this, 'name', { value: name });
  }
}

function initializeStats() {
  for (let i = 0; i < globalThis.globals.statList.length; i++) {
    addNewStat(globalThis.globals.statList[i]);
  }
}

function addNewStat(name) {
  globalThis.globals.stats[name] = new Stat(name);
}

function initializeSkills() {
  for (let i = 0; i < globalThis.globals.skillList.length; i++) {
    addNewSkill(globalThis.globals.skillList[i]);
  }
}

function addNewSkill(name) {
  globalThis.globals.skills[name] = new Skill(name);
  setSkillBonusType(name);
}

function initializeBuffs() {
  for (let i = 0; i < globalThis.globals.buffList.length; i++) {
    addNewBuff(globalThis.globals.buffList[i]);
  }
}

function addNewBuff(name) {
  globalThis.globals.buffs[name] = new Buff(name);
}

function getLevel(stat) {
  return globalThis.globals.stats[stat].statLevelExp.level;
}

function getTotalTalentLevel() {
  return Math.floor(Math.pow(globalThis.saving.vals.totalTalent, 0.2));
}

function getTotalTalentPrc() {
  return (Math.pow(globalThis.saving.vals.totalTalent, 0.2) -
    Math.floor(Math.pow(globalThis.saving.vals.totalTalent, 0.2))) * 100;
}

function getLevelFromExp(exp) {
  return Math.floor((Math.sqrt(8 * exp / 100 + 1) - 1) / 2);
}

function getExpOfLevel(level) {
  return level * (level + 1) * 50;
}

function getExpOfSingleLevel(level) {
  return level * 100;
}

function getTalent(stat) {
  return globalThis.globals.stats[stat].talentLevelExp.level;
}

function getLevelFromTalent(exp) {
  return Math.floor((Math.sqrt(8 * exp / 100 + 1) - 1) / 2);
}

function getExpOfTalent(level) {
  return level * (level + 1) * 50;
}

function getExpOfSingleTalent(level) {
  return level * 100;
}

function getPrcToNextLevel(stat) {
  const curLevelProgress = globalThis.globals.stats[stat].statLevelExp.exp;
  const nextLevelNeeds = globalThis.globals.stats[stat].statLevelExp.expRequiredForNextLevel;
  return Math.floor(curLevelProgress / nextLevelNeeds * 100 * 10) / 10;
}

function getPrcToNextTalent(stat) {
  const curLevelProgress = globalThis.globals.stats[stat].talentLevelExp.exp;
  const nextLevelNeeds = globalThis.globals.stats[stat].talentLevelExp.expRequiredForNextLevel;
  return Math.floor(curLevelProgress / nextLevelNeeds * 100 * 10) / 10;
}

function getSkillLevelFromExp(exp) {
  return Math.floor((Math.sqrt(8 * exp / 100 + 1) - 1) / 2);
}

function getExpOfSkillLevel(level) {
  return level * (level + 1) * 50;
}

function getSkillLevel(skill) {
  return globalThis.globals.skills[skill].levelExp.level;
}

function getSkillBonus(skill) {
  const bonus = globalThis.globals.skills[skill].getBonus();
  if (bonus === 0) {
    console.warn('Skill does not have curve set:', skill);
  }
  return bonus;
}

function setSkillBonusType(skill) {
  let change;
  if (
    skill === 'Dark' || skill === 'Chronomancy' || skill === 'Mercantilism' || skill === 'Divine' ||
    skill === 'Wunderkind' || skill === 'Thievery' || skill === 'Leadership'
  ) change = 'increase';
  else if (skill === 'Practical' || skill === 'Spatiomancy' || skill === 'Commune' || skill === 'Gluttony') {
    change = 'decrease';
  } else if (skill === 'Assassin') change = 'custom';

  if (change == 'increase') globalThis.globals.skills[skill].change = Skill_increase;
  else if (change == 'decrease') globalThis.globals.skills[skill].change = Skill_decrease;
  else if (change == 'custom') globalThis.globals.skills[skill].change = Skill_custom;
  else return globalThis.globals.skills[skill].change = 0;
}

function getSkillMod(name, min, max, percentChange) {
  if (getSkillLevel(name) < min) return 1;
  else return 1 + Math.min(getSkillLevel(name) - min, max - min) * percentChange / 100;
}

function getBuffLevel(buff) {
  return globalThis.globals.buffs[buff].amt;
}

function getBuffCap(buff) {
  // Fixme please! I need to have a storage in data space
  const input = document.getElementById(`buff${buff}Cap`);
  if (input instanceof HTMLInputElement) {
    return parseInt(input.value);
  }
  throw Error(`buff${buff}Cap not HTMLInputElement?`);
}

function getRitualBonus(min, max, speed) {
  if (getBuffLevel('Ritual') < min) return 1;
  else return 1 + Math.min(getBuffLevel('Ritual') - min, max - min) * speed / 100;
}

function getSurveyBonus(town) {
  return town.getLevel('Survey') * .005;
}

function getArmorLevel() {
  return 1 +
    ((globalThis.globals.resources.armor + 3 * globalThis.globals.resources.enchantments) *
        globalThis.actionList.getCraftGuildRank().bonus) / 5;
}

function getSelfCombat() {
  return ((getSkillLevel('Combat') + getSkillLevel('Pyromancy') * 5) *
    getArmorLevel() *
    (1 + getBuffLevel('Feast') * .05)) *
    globalThis.prestige.prestigeBonus('PrestigeCombat');
}

function getZombieStrength() {
  return getSkillLevel('Dark') *
    globalThis.globals.resources.zombie / 2 *
    Math.max(getBuffLevel('Ritual') / 100, 1) *
    (1 + getBuffLevel('Feast') * .05) *
    globalThis.prestige.prestigeBonus('PrestigeCombat');
}

function getTeamStrength() {
  return ((getSkillLevel('Combat') + getSkillLevel('Restoration') * 4) *
    (globalThis.globals.resources.teamMembers / 2) *
    globalThis.actionList.getAdvGuildRank().bonus * getSkillBonus('Leadership') *
    (1 + getBuffLevel('Feast') * .05)) *
    globalThis.prestige.prestigeBonus('PrestigeCombat');
}

function getTeamCombat() {
  return getSelfCombat() + getZombieStrength() + getTeamStrength();
}

function getPrcToNextSkillLevel(skill) {
  const curLevelProgress = globalThis.globals.skills[skill].levelExp.exp;
  const nextLevelNeeds = globalThis.globals.skills[skill].levelExp.expRequiredForNextLevel;
  return Math.floor(curLevelProgress / nextLevelNeeds * 100 * 10) / 10;
}

function addSkillExp(name, amount) {
  if (name === 'Combat' || name === 'Pyromancy' || name === 'Restoration') amount *= 1 + getBuffLevel('Heroism') * 0.02;
  const oldLevel = getSkillLevel(name);
  globalThis.globals.skills[name].levelExp.addExp(amount);
  const newLevel = getSkillLevel(name);
  if (oldLevel !== newLevel) {
    globalThis.globals.actionLog.addSkillLevel(globalThis.saving.actions.currentAction, name, newLevel, oldLevel);
  }
  globalThis.saving.view.requestUpdate('updateSkill', name);
}

function handleSkillExp(list) {
  for (const skill in list) {
    if (!isSkillName(skill)) {
      console.warn(`Unknown skill in handleSkillExp:`, skill);
      continue;
    }
    let exp = list[skill];
    if (typeof exp === 'function') {
      exp = exp();
    }
    if (Number.isFinite(exp)) addSkillExp(skill, exp);
    else {
      console.warn(`Invalid exp for ${skill} in skill list:`, list[skill], exp);
    }
  }
}

/**
 * @param {BuffName} name
 * @param {number} amount
 * @param {Action} [action]
 * @param {BuffEntry["statSpendType"]} [spendType]
 * @param {SoulstoneEntry["stones"]} [statsSpent]
 */
function addBuffAmt(name, amount, action, spendType, statsSpent) {
  const oldBuffLevel = getBuffLevel(name);
  if (oldBuffLevel === globalThis.globals.buffHardCaps[name]) return;
  globalThis.globals.buffs[name].amt += amount;
  if (amount === 0) globalThis.globals.buffs[name].amt = 0; // for presetige, reset to 0 when passed in.
  if (action) {
    globalThis.globals.actionLog.addBuff(
      action,
      name,
      globalThis.globals.buffs[name].amt,
      oldBuffLevel,
      spendType,
      statsSpent,
    );
  }
  globalThis.saving.view.requestUpdate('updateBuff', name);
}

const talentMultiplierCache = {
  aspirant: -1,
  wunderkind: -1,
  talentMultiplier: -1,
};
function getTalentMultiplier() {
  if (
    talentMultiplierCache.aspirant !== getBuffLevel('Aspirant') ||
    talentMultiplierCache.wunderkind !== getSkillBonus('Wunderkind')
  ) {
    talentMultiplierCache.aspirant = getBuffLevel('Aspirant');
    talentMultiplierCache.wunderkind = getSkillBonus('Wunderkind');
    const aspirantBonus = getBuffLevel('Aspirant') ? getBuffLevel('Aspirant') * 0.01 : 0;
    talentMultiplierCache.talentMultiplier = (getSkillBonus('Wunderkind') + aspirantBonus) / 100;
  }
  return talentMultiplierCache.talentMultiplier;
}

// how much "addExp" would you have to do to get this stat to the next exp or talent level

function getExpToLevel(name, talentOnly = false) {
  const expToNext = globalThis.globals.stats[name].statLevelExp.expToNextLevel;
  const talentToNext = globalThis.globals.stats[name].talentLevelExp.expToNextLevel;
  const talentMultiplier = getTalentMultiplier();
  return Math.ceil(Math.min(talentOnly ? Infinity : expToNext, talentToNext / talentMultiplier));
}

function addExp(name, amount) {
  globalThis.globals.stats[name].statLevelExp.addExp(amount);
  globalThis.globals.stats[name].soullessLevelExp.addExp(amount / globalThis.globals.stats[name].soulstoneMult);
  let talentGain = amount * getTalentMultiplier();
  globalThis.globals.stats[name].talentLevelExp.addExp(talentGain);
  globalThis.saving.vals.totalTalent += talentGain;
  globalThis.saving.view.requestUpdate('updateStat', name);
}

function restartStats() {
  for (let i = 0; i < globalThis.globals.statList.length; i++) {
    if (getSkillLevel('Wunderkind') > 0) {
      globalThis.globals.stats[globalThis.globals.statList[i]].statLevelExp.setLevel(getBuffLevel('Imbuement2') * 2);
    } else globalThis.globals.stats[globalThis.globals.statList[i]].statLevelExp.setLevel(getBuffLevel('Imbuement2'));
  }
  globalThis.saving.view.requestUpdate('updateStats', true);
}

function getTotalBonusXP(statName) {
  return globalThis.globals.stats[statName].totalBonusXP;
}

const _stats = {
  LevelExp,
  Stat,
  Skill,
  Buff,
  initializeStats,
  addNewStat,
  initializeSkills,
  addNewSkill,
  initializeBuffs,
  addNewBuff,
  getLevel,
  getTotalTalentLevel,
  getTotalTalentPrc,
  getLevelFromExp,
  getExpOfLevel,
  getExpOfSingleLevel,
  getTalent,
  getLevelFromTalent,
  getExpOfTalent,
  getExpOfSingleTalent,
  getPrcToNextLevel,
  getPrcToNextTalent,
  getSkillLevelFromExp,
  getExpOfSkillLevel,
  getSkillLevel,
  getSkillBonus,
  setSkillBonusType,
  getSkillMod,
  getBuffLevel,
  getBuffCap,
  getRitualBonus,
  getSurveyBonus,
  getArmorLevel,
  getSelfCombat,
  getZombieStrength,
  getTeamStrength,
  getTeamCombat,
  getPrcToNextSkillLevel,
  addSkillExp,
  handleSkillExp,
  addBuffAmt,
  getTalentMultiplier,
  getExpToLevel,
  addExp,
  restartStats,
  getTotalBonusXP,
};
globalThis.stats = _stats;
