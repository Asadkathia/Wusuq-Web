/** The "?" menu: replay the current page's tour, getting-started, jump to another tour, or toggle auto-play. */
'use client';

import { useRouter } from 'next/navigation';
import { HelpCircle } from 'lucide-react';
import { GETTING_STARTED_ID } from '@/lib/tours/auto-play';
import type { TourDefinition } from '@/lib/tours/types';
import { IconButton } from '../ui/icon-button';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '../ui/menu';
import { useTours } from './tour-context';

function hasHref(def: TourDefinition): def is TourDefinition & { href: string } {
  return typeof def.href === 'string';
}

export function TourMenu() {
  const tours = useTours();
  const router = useRouter();
  if (!tours) return null;

  const { pageTourId, available, start, requestTour, autoOff, setAutoOff } = tours;
  const pageTourAvailable = pageTourId !== null && available.some((def) => def.id === pageTourId);
  const others = available.filter((def) => def.id !== pageTourId && def.id !== GETTING_STARTED_ID).filter(hasHref);

  const goToTour = (def: TourDefinition & { href: string }) => {
    requestTour(def.id);
    router.push(def.href);
  };

  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton icon={<HelpCircle className="h-5 w-5" />} aria-label="Guided tours" data-tour="shell.tour-menu" />
      </MenuTrigger>
      <MenuContent align="end" className="w-64">
        {pageTourAvailable && pageTourId ? (
          <MenuItem onSelect={() => start(pageTourId)}>Tour this page</MenuItem>
        ) : null}
        <MenuItem onSelect={() => start(GETTING_STARTED_ID)}>Getting started</MenuItem>
        {others.length > 0 ? (
          <>
            <MenuSeparator />
            <MenuLabel>Other tours</MenuLabel>
            {others.map((def) => (
              <MenuItem key={def.id} onSelect={() => goToTour(def)}>
                {def.menuLabel}
              </MenuItem>
            ))}
          </>
        ) : null}
        <MenuSeparator />
        <MenuItem onSelect={() => setAutoOff(!autoOff)}>
          {autoOff ? 'Show tours automatically' : "Don't show tours automatically"}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
