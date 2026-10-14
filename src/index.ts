/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { World, VisibilityState, SessionMode } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { ShoppingSystem } from './shopping.js';
import { ModelPlacementSystem } from './model-placement.js';
import { mountDesktop } from './desktop.js';
import { enterImmersive } from './xr-session.js';
import './style.css';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(ShoppingSystem);
  world.registerSystem(ModelPlacementSystem);
  const desktop = document.getElementById('desktop')!;
  mountDesktop(desktop, {
    enterVR: () => enterImmersive(world, SessionMode.ImmersiveVR),
    enterAR: () => enterImmersive(world, SessionMode.ImmersiveAR),
    exitVR: async () => { if (world.session) await world.session.end(); },
  });
  let immersive = false;
  world.visibilityState.subscribe(value => {
    document.body.classList.toggle('xr-active', value !== VisibilityState.NonImmersive);
    const active = value !== VisibilityState.NonImmersive;
    world.requireSceneObject('landscape').visible = !active || world.session?.environmentBlendMode === 'opaque';
    if (active && !immersive) window.dispatchEvent(new Event('trail:xr-enter'));
    immersive = active;
  });
}).catch(error => {
  console.error('IWSDK could not start', error);
  const message = document.createElement('p');
  message.className = 'startup-error';
  message.textContent = 'The spatial scene could not start. Reload this page in a browser with WebGL enabled.';
  document.body.append(message);
});
