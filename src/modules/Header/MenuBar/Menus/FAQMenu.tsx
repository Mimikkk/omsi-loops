import { t } from '../../../../locales/translations.utils.ts';
import { For } from '../../../../components/flow/For/For.tsx';
import { Popover } from '../../../../components/containers/Overlay/primitives/Popover.tsx';
import { Button } from '../../../../components/buttons/Button/Button.tsx';
import { Tooltip } from '../../../../components/containers/Overlay/primitives/Tooltip.tsx';
import { HorizontalBar } from '../../../../components/flow/HorizontalBar/HorizontalBar.tsx';

export const FaqMenu = () => (
  <Popover>
    <Popover.Target>
      <Button variant='text'>{t('menu.faq.title')}</Button>
    </Popover.Target>
    <Popover.Content>
      <For each={t('menu.faq.questions')} as='ul' class='flex flex-col gap-1'>
        {(question) => (
          <>
            <Tooltip>
              <Tooltip.Target>
                <span class='font-medium'>{t('menu.faq.question')}:{' '}</span>
                {question.q}
              </Tooltip.Target>
              <Tooltip.Content>
                <span class='font-medium'>{t('menu.faq.answer')}:{' '}</span>
                {question.a}
              </Tooltip.Content>
            </Tooltip>
            <HorizontalBar />
          </>
        )}
      </For>
    </Popover.Content>
  </Popover>
);
