include(E:/Open-electronic-classroom/ui/Open-electronic-classroom/build/Desktop_Qt_6_5_3_MinGW_64_bit-Debug/.qt/QtDeploySupport.cmake)
include("${CMAKE_CURRENT_LIST_DIR}/Open-electronic-classroom-plugins.cmake" OPTIONAL)
set(__QT_DEPLOY_ALL_MODULES_FOUND_VIA_FIND_PACKAGE "ZlibPrivate;EntryPointPrivate;Core;Gui;Widgets")

qt6_deploy_runtime_dependencies(
    EXECUTABLE E:/Open-electronic-classroom/ui/Open-electronic-classroom/build/Desktop_Qt_6_5_3_MinGW_64_bit-Debug/Open-electronic-classroom.exe
    GENERATE_QT_CONF
)
