import type { ReactNode } from 'react';
import { Sidebar, type Route } from './Sidebar';

interface Props {
  current: Route;
  onNavigate: (r: Route) => void;
  children: ReactNode;
}

/**
 * App shell: fixed sidebar + scrollable main column.
 *
 * Layout notes carried over from earlier phases:
 *  - `w-full` not `w-screen`: on Windows `100vw` includes the scrollbar
 *    width and produces a phantom horizontal gap.
 *  - `min-w-0` on <main>: a flex child defaults to `min-width: auto`, which
 *    lets wide content (a long KaTeX line in a card grid) push the column
 *    past the viewport. `min-w-0` lets it shrink; `overflow-x-hidden` is the
 *    backstop.
 *  - `min-h-0` on <main>: keeps the scroll container bound to the flex
 *    parent's height so a mounting animation can't leave it stuck scrollable.
 *
 * Every surface here is a token — `bg-app` for the floor, `text-primary` for
 * the default ink. The theme (light/dark) is decided entirely by the `dark`
 * class on <html>; this component never knows or cares which one is active.
 */
export function Layout({ current, onNavigate, children }: Props) {
  return (
    <div className="h-screen w-full flex bg-app text-primary overflow-hidden">
      <Sidebar current={current} onNavigate={onNavigate} />
      <main className="flex-1 min-w-0 min-h-0 overflow-x-hidden overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
