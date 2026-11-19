THEOS_PACKAGE_SCHEME = rootless
ARCHS = arm64
TARGET := iphone:clang:latest:15.0
INSTALL_TARGET_PROCESSES = TestFlight Loon Shadowrocket

include $(THEOS)/makefiles/common.mk

TWEAK_NAME = TFHubInspector

TFHubInspector_FILES = Tweak.x
TFHubInspector_CFLAGS = -fobjc-arc -Wall
TFHubInspector_FRAMEWORKS = Foundation UIKit StoreKit

include $(THEOS_MAKE_PATH)/tweak.mk
