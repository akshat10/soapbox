'use client';

import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from '@/components/ui/native-select';
import { BODIES, WHEELS, BUILD_BUDGET, WHEELBASE_COST, buildCost, getBody, getWheel, isLegalBuild } from '@/game/catalogue';
import type { Blueprint } from '@/game/types';
import { SiliconBrand } from './SiliconBrand';

type Props = {
  soundControls: ReactNode;
  build: Blueprint;
  onChange: (build: Blueprint) => void;
  onBack: () => void;
  onStart: () => void;
  canRace: boolean;
  loaded: boolean;
  heat: number;
  muted: boolean;
  onToggleSound: () => void;
  showRules: boolean;
  onToggleRules: () => void;
  reverseArrows: boolean;
  onReverseArrowsChange: (reverse: boolean) => void;
};

export default function SoloGarageScreen(props: Props) {
  const { build, onChange } = props;
  const body = getBody(build.bodyId);
  const remaining = BUILD_BUDGET - buildCost(build);
  return <section className="solo-garage-screen">
    <div className="garage-selection-rail">
      <div className="landing-brand-row">
        <button className="brand-home" onClick={props.onBack} aria-label="Silicon Racer home"><SiliconBrand compact/></button>
        <div className="landing-actions">
          {props.soundControls}
          <button className="icon-button" onClick={props.onToggleRules} aria-label="How to play" aria-expanded={props.showRules}><HelpCircle size={18}/></button>
        </div>
      </div>
      <div className="garage-selection-content">
        <button className="text-button garage-back" onClick={props.onBack}><ArrowLeft size={16}/> Back</button>
        <h1>Make it yours.</h1>
        <p className="garage-intro">Pick your parts. Find your glory.</p>
        <div className="garage-simple-parts">
          <label htmlFor="solo-chassis">Chassis</label>
          <NativeSelect id="solo-chassis" value={build.bodyId} onChange={event => onChange({ ...build, bodyId: event.target.value })}>
            {[true, false].map(sf => <NativeSelectOptGroup key={String(sf)} label={sf ? 'San Francisco' : 'The Classics'}>
              {BODIES.filter(item => (item.family === 'sf') === sf).map(item => <NativeSelectOption key={item.id} value={item.id} disabled={!isLegalBuild({ ...build, bodyId: item.id })}>{item.name} · {item.cost} bolts</NativeSelectOption>)}
            </NativeSelectOptGroup>)}
          </NativeSelect>
          <label htmlFor="solo-wheels">Wheels</label>
          <NativeSelect id="solo-wheels" value={build.wheelId} onChange={event => onChange({ ...build, wheelId: event.target.value as Blueprint['wheelId'] })}>
            {WHEELS.map(wheel => <NativeSelectOption key={wheel.id} value={wheel.id} disabled={!isLegalBuild({ ...build, wheelId: wheel.id })}>{wheel.name} · {wheel.cost} bolts</NativeSelectOption>)}
          </NativeSelect>
        </div>
        <details className="garage-more-options">
          <summary>More options</summary>
          <label htmlFor="solo-spacing">Wheel spacing</label>
          <NativeSelect id="solo-spacing" value={build.wheelbase} onChange={event => onChange({ ...build, wheelbase: event.target.value as Blueprint['wheelbase'] })}>
            {(['short', 'standard', 'long'] as const).map(spacing => <NativeSelectOption key={spacing} value={spacing} disabled={!isLegalBuild({ ...build, wheelbase: spacing })}>{spacing === 'standard' ? 'Regular' : spacing === 'short' ? 'Short' : 'Long'} · {WHEELBASE_COST[spacing]} {WHEELBASE_COST[spacing] === 1 ? 'bolt' : 'bolts'}</NativeSelectOption>)}
          </NativeSelect>
          <p className="garage-budget">{remaining} of {BUILD_BUDGET} bolts left. Choose cheaper parts to free up your budget.</p>
          <label className="steering-preference"><input type="checkbox" checked={props.reverseArrows} onChange={event => props.onReverseArrowsChange(event.target.checked)}/><span>Reverse arrow keys</span></label>
        </details>
        <Button className="start-button garage-race-button" disabled={!props.canRace} onClick={props.onStart}>{props.loaded ? 'Let’s race' : 'Loading…'}<ArrowRight size={24}/></Button>
        <div className="landing-controls garage-control-hint"><span><kbd>←</kbd> <kbd>→</kbd> Steer</span><span><kbd>SPACE</kbd> Hold & release to hop</span><span><kbd>Z</kbd> Tap to boost</span></div>
      </div>
    </div>
    <section className="garage-car-stage" aria-label="Your car preview">
      <div className="garage-car-caption" aria-live="polite" aria-atomic="true">
        <span className="eyebrow">YOUR RIDE</span>
        <h2>{body.name}</h2>
        <p>{body.description}</p>
        <span className="sr-only">{getWheel(build.wheelId).name}, {build.wheelbase} wheel spacing.</span>
      </div>
      <p className="garage-heat-label">HEAT {props.heat} / 3 <span>YOU + 7 RIVALS</span></p>
    </section>
  </section>;
}
