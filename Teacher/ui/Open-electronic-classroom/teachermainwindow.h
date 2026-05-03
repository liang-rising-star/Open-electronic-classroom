#ifndef TEACHERMAINWINDOW_H
#define TEACHERMAINWINDOW_H

#include <QMainWindow>

QT_BEGIN_NAMESPACE
namespace Ui {
class TeacherMainWindow;
}
QT_END_NAMESPACE

class TeacherMainWindow : public QMainWindow
{
    Q_OBJECT

public:
    explicit TeacherMainWindow(QWidget *parent = nullptr);
    ~TeacherMainWindow() override;

private:
    Ui::TeacherMainWindow *ui;
};
#endif // TEACHERMAINWINDOW_H
