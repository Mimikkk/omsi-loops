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
} from './globals.ts';
import { prestigeBonus } from './prestige.ts';
import { actions } from './actions.ts';
import { getAdvGuildRank, getCraftGuildRank } from './actionList.ts';
import { vals } from './saving.ts';
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

export class Stat {
  statLevelExp = new LevelExp();
  talentLevelExp = new LevelExp();
  soullessLevelExp = new LevelExp();
  soulstone = 0;

  prestigeBuff;

  constructor(public name: string) {
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

  get talent() {
    return this.talentLevelExp.totalExp;
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
      this.#totalBonusXP = this.soulstoneMult * this.talentMult * prestigeBonus(this.prestigeBuff);
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

export class Skill {
  levelExp = new LevelExp();

  change = 0;

  constructor(public name: string) {
  }

  get exp() {
    return this.levelExp.totalExp;
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

export class Buff {
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

  constructor(name) {
    Object.defineProperty(this, 'name', { value: name });
  }
}

export function initializeStats() {
  for (let i = 0; i < statList.length; i++) {
    addNewStat(statList[i]);
  }
}

export function addNewStat(name) {
  stats[name] = new Stat(name);
}

export function initializeSkills() {
  for (let i = 0; i < skillList.length; i++) {
    addNewSkill(skillList[i]);
  }
}

export function addNewSkill(name) {
  skills[name] = new Skill(name);
  setSkillBonusType(name);
}

export function initializeBuffs() {
  for (let i = 0; i < buffList.length; i++) {
    addNewBuff(buffList[i]);
  }
}

export function addNewBuff(name) {
  buffs[name] = new Buff(name);
}

export function getLevel(stat) {
  return stats[stat].statLevelExp.level;
}

export function getTotalTalentLevel() {
  return Math.floor(Math.pow(vals.totalTalent, 0.2));
}

export function getTotalTalentPrc() {
  return (Math.pow(vals.totalTalent, 0.2) -
    Math.floor(Math.pow(vals.totalTalent, 0.2))) * 100;
}

export function getLevelFromExp(exp) {
  return Math.floor((Math.sqrt(8 * exp / 100 + 1) - 1) / 2);
}

export function getExpOfLevel(level) {
  return level * (level + 1) * 50;
}

export function getExpOfSingleLevel(level) {
  return level * 100;
}

export function getTalent(stat) {
  return stats[stat].talentLevelExp.level;
}

export function getLevelFromTalent(exp) {
  return Math.floor((Math.sqrt(8 * exp / 100 + 1) - 1) / 2);
}

export function getExpOfTalent(level) {
  return level * (level + 1) * 50;
}

export function getExpOfSingleTalent(level) {
  return level * 100;
}

export function getPrcToNextLevel(stat) {
  const curLevelProgress = stats[stat].statLevelExp.exp;
  const nextLevelNeeds = stats[stat].statLevelExp.expRequiredForNextLevel;
  return Math.floor(curLevelProgress / nextLevelNeeds * 100 * 10) / 10;
}

export function getPrcToNextTalent(stat) {
  const curLevelProgress = stats[stat].talentLevelExp.exp;
  const nextLevelNeeds = stats[stat].talentLevelExp.expRequiredForNextLevel;
  return Math.floor(curLevelProgress / nextLevelNeeds * 100 * 10) / 10;
}

export function getSkillLevelFromExp(exp) {
  return Math.floor((Math.sqrt(8 * exp / 100 + 1) - 1) / 2);
}

export function getExpOfSkillLevel(level) {
  return level * (level + 1) * 50;
}

export function getSkillLevel(skill) {
  return skills[skill].levelExp.level;
}

export function getSkillBonus(skill) {
  const bonus = skills[skill].getBonus();
  if (bonus === 0) {
    console.warn('Skill does not have curve set:', skill);
  }
  return bonus;
}

export function setSkillBonusType(skill) {
  let change;
  if (
    skill === 'Dark' || skill === 'Chronomancy' || skill === 'Mercantilism' || skill === 'Divine' ||
    skill === 'Wunderkind' || skill === 'Thievery' || skill === 'Leadership'
  ) change = 'increase';
  else if (skill === 'Practical' || skill === 'Spatiomancy' || skill === 'Commune' || skill === 'Gluttony') {
    change = 'decrease';
  } else if (skill === 'Assassin') change = 'custom';

  if (change == 'increase') skills[skill].change = Skill_increase;
  else if (change == 'decrease') skills[skill].change = Skill_decrease;
  else if (change == 'custom') skills[skill].change = Skill_custom;
  else return skills[skill].change = 0;
}

export function getSkillMod(name, min, max, percentChange) {
  if (getSkillLevel(name) < min) return 1;
  else return 1 + Math.min(getSkillLevel(name) - min, max - min) * percentChange / 100;
}

export function getBuffLevel(buff) {
  return buffs[buff].amt;
}

export function getBuffCap(buff) {
  return buffCaps[buff];
}

export function getRitualBonus(min, max, speed) {
  if (getBuffLevel('Ritual') < min) return 1;
  else return 1 + Math.min(getBuffLevel('Ritual') - min, max - min) * speed / 100;
}

export function getSurveyBonus(town) {
  return town.getLevel('Survey') * .005;
}

export function getArmorLevel() {
  return 1 +
    ((resources.armor + 3 * resources.enchantments) *
        getCraftGuildRank().bonus) / 5;
}

export function getSelfCombat() {
  return ((getSkillLevel('Combat') + getSkillLevel('Pyromancy') * 5) *
    getArmorLevel() *
    (1 + getBuffLevel('Feast') * .05)) *
    prestigeBonus('PrestigeCombat');
}

export function getZombieStrength() {
  return getSkillLevel('Dark') *
    resources.zombie / 2 *
    Math.max(getBuffLevel('Ritual') / 100, 1) *
    (1 + getBuffLevel('Feast') * .05) *
    prestigeBonus('PrestigeCombat');
}

export function getTeamStrength() {
  return ((getSkillLevel('Combat') + getSkillLevel('Restoration') * 4) *
    (resources.teamMembers / 2) *
    getAdvGuildRank().bonus * getSkillBonus('Leadership') *
    (1 + getBuffLevel('Feast') * .05)) *
    prestigeBonus('PrestigeCombat');
}

export function getTeamCombat() {
  return getSelfCombat() + getZombieStrength() + getTeamStrength();
}

export function getPrcToNextSkillLevel(skill) {
  const curLevelProgress = skills[skill].levelExp.exp;
  const nextLevelNeeds = skills[skill].levelExp.expRequiredForNextLevel;
  return Math.floor(curLevelProgress / nextLevelNeeds * 100 * 10) / 10;
}

export function addSkillExp(name, amount) {
  if (name === 'Combat' || name === 'Pyromancy' || name === 'Restoration') amount *= 1 + getBuffLevel('Heroism') * 0.02;
  const oldLevel = getSkillLevel(name);
  skills[name].levelExp.addExp(amount);
  const newLevel = getSkillLevel(name);
  if (oldLevel !== newLevel) {
    actionLog.addSkillLevel(actions.currentAction, name, newLevel, oldLevel);
  }
}

export function handleSkillExp(list) {
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

export function addBuffAmt(name, amount, action, spendType, statsSpent) {
  const oldBuffLevel = getBuffLevel(name);
  if (oldBuffLevel === buffHardCaps[name]) return;
  buffs[name].amt += amount;
  if (amount === 0) buffs[name].amt = 0; // for presetige, reset to 0 when passed in.
  if (action) {
    actionLog.addBuff(
      action,
      name,
      buffs[name].amt,
      oldBuffLevel,
      spendType,
      statsSpent,
    );
  }
}

const talentMultiplierCache = {
  aspirant: -1,
  wunderkind: -1,
  talentMultiplier: -1,
};
export function getTalentMultiplier() {
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

export function getExpToLevel(name, talentOnly = false) {
  const expToNext = stats[name].statLevelExp.expToNextLevel;
  const talentToNext = stats[name].talentLevelExp.expToNextLevel;
  const talentMultiplier = getTalentMultiplier();
  return Math.ceil(Math.min(talentOnly ? Infinity : expToNext, talentToNext / talentMultiplier));
}

export function addExp(name, amount) {
  stats[name].statLevelExp.addExp(amount);
  stats[name].soullessLevelExp.addExp(amount / stats[name].soulstoneMult);
  let talentGain = amount * getTalentMultiplier();
  stats[name].talentLevelExp.addExp(talentGain);
  vals.totalTalent += talentGain;
}

export function restartStats() {
  for (let i = 0; i < statList.length; i++) {
    if (getSkillLevel('Wunderkind') > 0) {
      stats[statList[i]].statLevelExp.setLevel(getBuffLevel('Imbuement2') * 2);
    } else stats[statList[i]].statLevelExp.setLevel(getBuffLevel('Imbuement2'));
  }
}

export function getTotalBonusXP(statName) {
  return stats[statName].totalBonusXP;
}
