import { Telegraf, session, Stage } from 'telegraf';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerService } from 'nest-logger';
import { LoggerModule } from './logger.module';
import { AuthSceneBuilder } from './bot-scenes/auth.scene';
import { ConfigurationService } from '../../core/config/configuration.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['../config/.env.development', '../config/.env.production'],
    }),
    LoggerModule,
  ],
  providers: [AuthSceneBuilder, ConfigurationService],
})
export class BotModule {
  constructor(
    private readonly authSceneBuilder: AuthSceneBuilder,
    private readonly logger: LoggerService,
    private readonly configurationService: ConfigurationService,
  ) {
    this.init(process.env.BOT_TOKEN).then(async () => {
      this.logger.log('Bot has been started');
      this.logger.log(`DB Connection: ${configurationService.appconfig.dbConnectionString}`);
    });
  }

  private bot;

  private init(botToken): Promise<void> {
    const startMessage = 'Hello From Bot!';

    this.bot = new Telegraf(botToken);

    const authScene = this.authSceneBuilder.build();
    const stage = new Stage([authScene]);
    this.bot.use(stage.middleware());
    this.bot.use(session());

    this.bot.catch((err, ctx) => {
      this.logger.error(`Error for ${ctx.updateType}`, err?.stack);
    });

    this.bot.start(async ctx => {
      await ctx.reply(startMessage);
    });

    return this.bot.launch();
  }
}
