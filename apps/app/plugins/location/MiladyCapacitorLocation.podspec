require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'MiladyCapacitorLocation'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license'] || { :type => 'MIT' }
  s.homepage = 'https://milady.ai'
  s.authors = { 'Milady' => 'dev@milady.ai' }
  s.source = { :git => 'https://github.com/milady-ai/milady.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '13.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
end
