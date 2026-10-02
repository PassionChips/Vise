require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ViseCore'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = 'VISE'
  s.homepage       = 'https://github.com/PassionChips/Vise'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/PassionChips/Vise.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '*.{h,m,swift}'
  # libvise_core.a (universal static library) is produced by scripts/build-ios-core.sh (macOS only)
  s.vendored_libraries = 'libvise_core.a'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
