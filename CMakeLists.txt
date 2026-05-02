cmake_minimum_required(VERSION 3.19)
project(Open-electronic-classroom LANGUAGES CXX)

find_package(Qt6 6.5 REQUIRED COMPONENTS Core Widgets LinguistTools)

qt_standard_project_setup()

qt_add_executable(Open-electronic-classroom WIN32 MACOSX_BUNDLE
    main.cpp
    teachermainwindow.cpp
    teachermainwindow.h
    teachermainwindow.ui
    app.rc
)

set_target_properties(Open-electronic-classroom PROPERTIES
    WIN32_EXECUTABLE TRUE
)

# qt_add_translations(
#     TARGETS Open-electronic-classroom
#     TS_FILES Open-electronic-classroom_zh_CN.ts
# )

target_link_libraries(Open-electronic-classroom
    PRIVATE
        Qt::Core
        Qt::Widgets
)

install(TARGETS Open-electronic-classroom
    BUNDLE  DESTINATION .
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
)

qt_generate_deploy_app_script(
    TARGET Open-electronic-classroom
    OUTPUT_SCRIPT deploy_script
    NO_UNSUPPORTED_PLATFORM_ERROR
)
install(SCRIPT ${deploy_script})
