shell_version = '3.36.0'
split_version = shell_version.split('.')

# We depend on a specific version of the libmutter API. The mutter variants of
# the Cogl and Clutter libraries also use this API version.
# The API version is increased automatically each development cycle,
# starting with 0 in 3.23.x
api_version = (split_version[1].to_int() - 23) / 2
mutter_api_version = '@0@'.format(api_version)

clutter_pc = 'mutter-clutter-' + mutter_api_version
cogl_pc = 'mutter-cogl-' + mutter_api_version
libmutter_pc = 'libmutter-' + mutter_api_version

mutter_req = '>= 3.36.0'

gnome = import('gnome')
i18n  = import('i18n')

prefix = get_option('prefix')

mutter_dep = dependency(libmutter_pc, version: mutter_req)
clutter_dep = dependency(clutter_pc, version: mutter_req)
cogl_dep = dependency(cogl_pc, version: mutter_req)

cc = meson.get_compiler('c')

# Endless-specific: Custom animations
libanimation_glib_dep = dependency('libanimation-glib-0')
libeos_shell_fx_deps = [clutter_dep, libanimation_glib_dep]

hackfx_deps = [
  clutter_dep,
  cogl_dep,
  mutter_dep,
]

hackfx_cflags = [
  '-DCLUTTER_ENABLE_EXPERIMENTAL_API',
  '-DCOGL_ENABLE_EXPERIMENTAL_API',
  '-DVERSION="@0@"'.format(meson.project_version()),
]

libhackfx_public_headers = [
  'hackfx-code-view-effect.h',
]

libhackfx_private_headers = [
]

libhackfx_private_sources = [
]

libhackfx_sources = [
  'hackfx-code-view-effect.c',
]

libhackfx_enums = gnome.mkenums_simple('hackfx-enum-types',
  sources: libhackfx_public_headers
)

libhackfx_gir_sources = [
  libhackfx_enums,
  libhackfx_public_headers,
  libhackfx_sources
]

libhackfx_no_gir_sources = [
  libhackfx_private_headers,
  libhackfx_private_sources
]

libhackfx = shared_library('hackfx',
  sources: libhackfx_gir_sources + libhackfx_no_gir_sources,
  dependencies: hackfx_deps,
  c_args: hackfx_cflags,
  install: true
)

libhackfx_dep = declare_dependency(link_with: libhackfx)

libhackfx_gir_includes = [
  'Clutter-@0@'.format(mutter_api_version),
  'ClutterX11-@0@'.format(mutter_api_version),
  'Meta-@0@'.format(mutter_api_version),
]

gnome.generate_gir(libhackfx,
  sources: libhackfx_gir_sources,
  nsversion: '0.1',
  namespace: 'Hackfx',
  includes: libhackfx_gir_includes,
  extra_args: ['--quiet'],
  install: true
)
