project('hack-extension',
  version: '3.38.0',
  meson_version: '>= 0.40.0'
)

sources = [
  'extension.js',
  'service.js',
  'utils.js',
]
extra_sources = [
  'COPYING',
]
dist_files = sources + extra_sources
dist_files += [
  'ui',
  'misc',
  'data',
  'schemas',
  'migration',
]

i18n = import('i18n')
subdir('locale')

schemas = ['org.endlessos.hack-extension']

uuid = 'eos-hack@endlessos.org'

ver_arr = meson.project_version().split('.')
if ver_arr[1].to_int().is_even()
  shell_version = '@0@.@1@'.format(ver_arr[0], ver_arr[1])
else
  shell_version = '.'.join(ver_arr)
endif

datadir = get_option('datadir')
extensiondir = join_paths(datadir, 'gnome-shell', 'extensions')
schemadir = join_paths(extensiondir, uuid, 'schemas')

have_schemas = schemas.length() > 0

metaconf = configuration_data()
metaconf.set('uuid', uuid)
metaconf.set('version', 8)
metaconf.set('shell_version', shell_version)
if have_schemas
  metaconf.set('settings_schema', schemas[0])
endif

meta = [
  configure_file(
    input: 'metadata.json.in',
    output: 'metadata.json',
    configuration: metaconf
  )
]

install_data(sources + extra_sources + meta,
  install_dir: join_paths(extensiondir, uuid)
)
install_subdir('data', install_dir: join_paths(extensiondir, uuid))
install_subdir('misc', install_dir: join_paths(extensiondir, uuid))
install_subdir('ui', install_dir: join_paths(extensiondir, uuid))

install_subdir('autostart', install_dir: join_paths(datadir, 'gnome'), strip_directory: false)

glib_compile = find_program('glib-compile-schemas', required: true)
schemas_files = []
foreach s : schemas
  schema = 'schemas/@0@.gschema.xml'.format(s)
  schemas_files += schema
  install_data(schema,
    install_dir: schemadir
  )
endforeach

run_command([glib_compile, 'schemas'])
install_data('schemas/gschemas.compiled', install_dir: schemadir)

run_command([glib_compile, 'migration'])
install_subdir('migration', install_dir: join_paths(extensiondir, uuid))

sassc = find_program('sassc', required: true)
sassc_opts = [ '-a', '-M', '-t', 'compact' ]
styles = custom_target('styles',
                       input: 'stylesheet.scss',
                       output: 'stylesheet.css',
                       command: [
                         sassc, sassc_opts, '@INPUT@', '@OUTPUT@',
                       ],
                       depend_files: 'stylesheet.scss',
                       install: true,
                       install_dir: join_paths(extensiondir, uuid),
                       build_by_default: true)

extension_tool = find_program('gnome-extensions', required: false)
if extension_tool.found()
  builddir = meson.current_build_dir()
  srcdir = meson.current_source_dir()

  command = [
    extension_tool,
    'pack',
    '--force',
    '--out-dir=@0@'.format(builddir),
    '--extra-source=@0@/stylesheet.css'.format(builddir),
    '--extra-source=@0@/metadata.json'.format(builddir),
  ]

  foreach s : dist_files
    command += '--extra-source=@0@'.format(s)
  endforeach

  command += srcdir

  run_target('zip-file', command: command, depends: styles)
endif
