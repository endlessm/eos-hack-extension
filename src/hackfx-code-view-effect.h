/*
 * hackfx-code-view-effect.h
 *
 * Based on clutter-desaturate-effect.h.
 *
 * Copyright (C) 2010  Intel Corporation.
 * Copyright (C) 2018  Endless Mobile, Inc.
 * Copyright (C) 2020  Endless OS LLC.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library. If not, see <http://www.gnu.org/licenses/>.
 *
 * Authors:
 *   Emmanuele Bassi <ebassi@linux.intel.com>
 *   Cosimo Cecchi <cosimo@endlessm.com>
 *   Daniel Garcia Moreno <daniel@endlessm.com>
 */

#ifndef __HACKFX_CODE_VIEW_EFFECT_H__
#define __HACKFX_CODE_VIEW_EFFECT_H__

#include <clutter/clutter.h>

G_BEGIN_DECLS

#define HACKFX_TYPE_CODE_VIEW_EFFECT (hackfx_code_view_effect_get_type ())
G_DECLARE_DERIVABLE_TYPE (HackfxCodeViewEffect, hackfx_code_view_effect,
                          HACKFX, CODE_VIEW_EFFECT, ClutterOffscreenEffect)

ClutterEffect *hackfx_code_view_effect_new      (void);

void hackfx_code_view_effect_set_gradient_stops (HackfxCodeViewEffect *effect,
                                                 gchar **gradient_colors,
                                                 gfloat *gradient_points,
                                                 gsize gradient_len);

G_END_DECLS

#endif /* __HACKFX_CODE_VIEW_EFFECT_H__ */
