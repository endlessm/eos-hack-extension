# Shell extension that provides the Hack experience on EOS

## Build

```
meson _build --prefix=/usr
ninja -C _build
ninja -C _build install
```

## Translations

If you want to add a new language you should update the file
`locale/LINUGAS` and add the new lang to the list.

To generate .pot files you should run:

```
ninja -C _build hack-extension-pot
```

To generate .po files you should run:

```
ninja -C _build hack-extension-update-po
```
