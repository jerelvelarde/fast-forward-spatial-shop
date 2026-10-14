import { createComponent, Types } from '@iwsdk/core';

export const TryOnKinds = { Glasses: 'glasses', Cap: 'cap', Backpack: 'backpack' } as const;

/**
 * A product model the wearer has on. TryOnSystem fits every entity with this
 * component to the tracked face or body each frame.
 */
export const WornProduct = createComponent('WornProduct', {
  kind: { type: Types.Enum, enum: TryOnKinds, default: TryOnKinds.Glasses },
  productId: { type: Types.String, default: '' },
  variantId: { type: Types.String, default: '' },
}, 'A product worn by the person in the camera feed');
