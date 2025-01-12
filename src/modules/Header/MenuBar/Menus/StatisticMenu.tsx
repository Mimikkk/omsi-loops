import { createStore } from 'solid-js/store';
import { formatNumber } from '../../../../original/helpers.ts';
import { vals } from '../../../../original/saving.ts';
import { formatTime } from '../../../../views/main.view.ts';
import { createInterval } from '../../../../signals/createInterval.ts';

export const StatisticMenu = () => {
  // document.getElementById('totalPlaytime').textContent = `${formatTime(vals.totals.time)}`;
  // document.getElementById('totalEffectiveTime').textContent = `${formatTime(vals.totals.effectiveTime)}`;
  // document.getElementById('borrowedTimeBalance').textContent = formatTime(vals.totals.borrowedTime);
  // document.getElementById('borrowedTimeDays').textContent = `${formatNumber(Math.floor(vals.totals.borrowedTime / 86400))}${Localization.txt('time_controls>days')}`;
  // document.getElementById('totalLoops').textContent = `${formatNumber(vals.totals.loops)}`;
  // document.getElementById('totalActions').textContent = `${formatNumber(vals.totals.actions)}`;

  const [store, setStore] = createStore({
    time: vals.totals.time,
    effectiveTime: vals.totals.effectiveTime,
    borrowedTime: vals.totals.borrowedTime,
    loops: vals.totals.loops,
    actions: vals.totals.actions,
  });

  createInterval(() => {
    setStore({
      time: vals.totals.time,
      effectiveTime: vals.totals.effectiveTime,
      borrowedTime: vals.totals.borrowedTime,
      loops: vals.totals.loops,
      actions: vals.totals.actions,
    });
  });

  return (
    <li class='contains-popover'>
      Totals
      <div class='popover-content'>
        <div class='grid grid-cols-[1fr_auto] gap-2'>
          <span class='font-medium'>Time borrowed:</span>
          <span>
            {formatTime(store.borrowedTime)}
          </span>
          <span class='font-medium'>Effective Time:</span>
          <span>
            {formatTime(store.effectiveTime)}
          </span>
          <span class='font-medium'>Running Time:</span>
          <span>
            {formatTime(store.time)}
          </span>
          <span class='font-medium'>Loops:</span>
          <span>
            {formatNumber(store.loops)}
          </span>
          <span class='font-medium'>Actions:</span>
          <span>
            {formatNumber(store.actions)}
          </span>
        </div>
      </div>
    </li>
  );
};
