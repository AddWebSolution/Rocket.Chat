import { ILivechatAgentStatus, LivechatBusinessHourTypes } from '@rocket.chat/core-typings';
import { LivechatBusinessHours, Users } from '@rocket.chat/models';

import { businessHourLogger } from '../lib/logger';
import type { IBusinessHourBehavior } from './AbstractBusinessHour';
import { AbstractBusinessHourBehavior } from './AbstractBusinessHour';
import { filterBusinessHoursThatMustBeOpened, openBusinessHourDefault } from './Helper';

export class SingleBusinessHourBehavior extends AbstractBusinessHourBehavior implements IBusinessHourBehavior {
	async openBusinessHoursByDayAndHour(): Promise<void> {
		businessHourLogger.debug('opening single business hour');
		return openBusinessHourDefault();
	}

	async closeBusinessHoursByDayAndHour(day: string, hour: string): Promise<void> {
		const businessHoursIds = (
			await this.BusinessHourRepository.findActiveBusinessHoursToClose(day, hour, LivechatBusinessHourTypes.DEFAULT, {
				projection: { _id: 1 },
			})
		).map((businessHour) => businessHour._id);
		await this.UsersRepository.closeAgentsBusinessHoursByBusinessHourIds(businessHoursIds);
		await this.UsersRepository.updateLivechatStatusBasedOnBusinessHours();
	}

	async onStartBusinessHours(): Promise<void> {
		businessHourLogger.debug('Starting Single Business Hours');
		return openBusinessHourDefault();
	}

	async onNewAgentCreated(agentId: string): Promise<void> {
		businessHourLogger.debug('Executing onNewAgentCreated for agent in single BH mode', {
			agentId,
		});

		const defaultBusinessHour = await LivechatBusinessHours.findOneDefaultBusinessHour();
		if (!defaultBusinessHour) {
			businessHourLogger.debug('No default business hour found for agentId', {
				agentId,
			});
			return;
		}

		const businessHourToOpen = await filterBusinessHoursThatMustBeOpened([defaultBusinessHour]);
		if (!businessHourToOpen.length) {
			businessHourLogger.debug("No business hour to open found for agent. Default business hour is closed. Updating agent's status", {
				agentId,
				status: ILivechatAgentStatus.NOT_AVAILABLE,
			});
			await Users.setLivechatStatus(agentId, ILivechatAgentStatus.NOT_AVAILABLE);
			return;
		}

		await Users.addBusinessHourByAgentIds([agentId], defaultBusinessHour._id);

		businessHourLogger.debug("Updated agent's status", {
			agentId,
			status: ILivechatAgentStatus.AVAILABLE,
		});
	}

	afterSaveBusinessHours(): Promise<void> {
		return openBusinessHourDefault();
	}

	removeBusinessHourById(): Promise<void> {
		return Promise.resolve();
	}

	onAddAgentToDepartment(): Promise<any> {
		return Promise.resolve();
	}

	onRemoveAgentFromDepartment(): Promise<void> {
		return Promise.resolve();
	}

	onRemoveDepartment(): Promise<void> {
		return Promise.resolve();
	}

	onDepartmentDisabled(): Promise<void> {
		return Promise.resolve();
	}

	onDepartmentArchived(): Promise<void> {
		return Promise.resolve();
	}
}
