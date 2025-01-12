import './styles.css';

import { render } from 'solid-js/web';
import { Application } from './Application.tsx';
import { Localization } from './localization.ts';
import { loadDefaults, startGame } from './saving.ts';

import { setActions } from './views/register-all.ts';

const main = document.getElementById('app');
if (main) render(Application, main);

loadDefaults();

await Localization.init();
setActions();

Localization.populate();
startGame();
