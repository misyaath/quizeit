FROM codercom/code-server:4.145.2

USER root
COPY quiz-activity /opt/quiz-extensions/azure-study.quiz-activity
RUN mkdir -p /opt/quiz-extensions \
    && code-server --extensions-dir /opt/quiz-extensions --install-extension ms-pyright.pyright \
    && cp -R /opt/quiz-extensions/azure-study.quiz-activity /opt/quiz-extensions/ms-pyright.pyright-* /usr/lib/code-server/lib/vscode/extensions/ \
    && rm -rf /opt/quiz-extensions

USER coder
