#include "teachermainwindow.h"

#include <QApplication>
#include <QLocale>
#include <QTranslator>
#include <QIcon>
#include <QCoreApplication>

int main(int argc, char *argv[])
{
    QApplication a(argc, argv);

    QString iconPath = QCoreApplication::applicationDirPath() + "/../icon/app-icon.png";
    QIcon icon(iconPath);
    a.setWindowIcon(icon);

    QTranslator translator;
    const QStringList uiLanguages = QLocale::system().uiLanguages();
    for (const QString &locale : uiLanguages) {
        const QString baseName = "Open-electronic-classroom_" + QLocale(locale).name();
        if (translator.load(":/i18n/" + baseName)) {
            a.installTranslator(&translator);
            break;
        }
    }
    TeacherMainWindow w;
    w.show();
    return QCoreApplication::exec();
}
